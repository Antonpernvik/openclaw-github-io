'use strict';

/* ════════════════════════════════════════════════════
   OpenClaw — Chrome Extension Analyzer
   Sitemap parsing, crawling, PageRank + D3 graph
════════════════════════════════════════════════════ */

// ── URL params ───────────────────────────────────
const params     = new URLSearchParams(location.search);
const sitemapUrl = params.get('sitemap')  || '';
const maxPages   = parseInt(params.get('maxPages') || '200', 10);
const reqDelay   = parseInt(params.get('delay')    || '100', 10);
const PR_ITER    = 50;
const PR_DAMP    = 0.85;

let graphData = null;

// ── Fetch ────────────────────────────────────────
async function fetchText(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.text();
}

// ── Sitemap parser ───────────────────────────────
async function parseSitemap(url, depth = 0) {
  if (depth > 5) return [];
  const xml  = await fetchText(url);
  const urls = [];

  // Sitemap index entries
  for (const m of xml.matchAll(/<sitemap>[\s\S]*?<loc>([\s\S]*?)<\/loc>[\s\S]*?<\/sitemap>/g)) {
    const child = await parseSitemap(m[1].trim(), depth + 1);
    urls.push(...child);
  }

  // Regular <url> entries
  for (const m of xml.matchAll(/<url>[\s\S]*?<loc>([\s\S]*?)<\/loc>[\s\S]*?<\/url>/g)) {
    const u = m[1].trim().replace(/&amp;/g, '&');
    if (u) urls.push(u);
  }

  return [...new Set(urls)];
}

// ── URL helpers ──────────────────────────────────
function normalizeUrl(raw, base) {
  try {
    const u = new URL(raw, base);
    u.hash  = '';
    return u.origin + u.pathname.replace(/\/$/, '') + u.search;
  } catch { return null; }
}

function urlKey(url) {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname.replace(/\/$/, '') + u.search).toLowerCase();
  } catch { return url.toLowerCase(); }
}

// ── Link extractor ───────────────────────────────
function extractInternalLinks(html, pageUrl, baseOrigin) {
  const doc   = new DOMParser().parseFromString(html, 'text/html');
  const links = new Set();

  for (const a of doc.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || '';
    if (/^(mailto:|tel:|javascript:|#)/.test(href.trim())) continue;
    const normalized = normalizeUrl(href.trim(), pageUrl);
    if (!normalized) continue;
    try {
      if (new URL(normalized).origin === baseOrigin) links.add(normalized);
    } catch { /* skip */ }
  }

  return [...links];
}

// ── Crawler ──────────────────────────────────────
async function crawlPages(sitemapUrls, maxPagesLimit, requestDelay, onProgress) {
  const pageMap    = new Map();
  const edges      = [];
  const baseOrigin = new URL(sitemapUrls[0]).origin;
  const limited    = sitemapUrls.slice(0, maxPagesLimit);
  const total      = limited.length;

  // Seed nodes from sitemap
  for (const url of limited) {
    const key = urlKey(url);
    if (!pageMap.has(key)) {
      pageMap.set(key, { url, key, inDegree: 0, outDegree: 0, pageRank: 0, pageRankNorm: 0, outLinks: [] });
    }
  }

  // Crawl each page
  for (let i = 0; i < limited.length; i++) {
    const url  = limited[i];
    const node = pageMap.get(urlKey(url));

    onProgress({ current: i + 1, total, currentUrl: url, phase: 'crawling' });

    try {
      const html    = await fetchText(url);
      const outUrls = extractInternalLinks(html, url, baseOrigin);

      for (const targetUrl of outUrls) {
        const targetKey = urlKey(targetUrl);
        if (!pageMap.has(targetKey) || targetKey === node.key) continue;
        if (edges.some(e => e.source === node.key && e.target === targetKey)) continue;

        edges.push({ source: node.key, target: targetKey });
        node.outLinks.push(targetKey);
        node.outDegree++;
        pageMap.get(targetKey).inDegree++;
      }
    } catch { /* skip pages that fail */ }

    if (requestDelay > 0 && i < limited.length - 1) {
      await new Promise(r => setTimeout(r, requestDelay));
    }
  }

  return { nodes: pageMap, edges };
}

// ── PageRank ─────────────────────────────────────
function computePageRank(nodes, iterations, damping) {
  const N = nodes.size;
  if (N === 0) return;

  for (const node of nodes.values()) node.pageRank = 1 / N;

  // Build reverse adjacency
  const inLinks = new Map();
  for (const key of nodes.keys()) inLinks.set(key, new Set());
  for (const node of nodes.values()) {
    for (const target of node.outLinks) inLinks.get(target)?.add(node.key);
  }

  for (let iter = 0; iter < iterations; iter++) {
    const newRanks = new Map();
    let danglingSum = 0;
    for (const [, node] of nodes) {
      if (node.outDegree === 0) danglingSum += node.pageRank;
    }
    for (const [key] of nodes) {
      let sum = 0;
      for (const srcKey of inLinks.get(key)) {
        const src = nodes.get(srcKey);
        if (src.outDegree > 0) sum += src.pageRank / src.outDegree;
      }
      sum += danglingSum / N;
      newRanks.set(key, (1 - damping) / N + damping * sum);
    }
    for (const [key, node] of nodes) node.pageRank = newRanks.get(key);
  }

  // Normalize to [0, 1]
  const ranks   = [...nodes.values()].map(n => n.pageRank);
  const maxRank = Math.max(...ranks);
  const minRank = Math.min(...ranks);
  const range   = maxRank - minRank || 1;
  for (const node of nodes.values()) {
    node.pageRankNorm = (node.pageRank - minRank) / range;
  }
}

// ── Progress UI ──────────────────────────────────
function setProgress(current, total, currentUrl, phase) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  document.getElementById('bar').style.width = pct + '%';

  const phases = { sitemap: 'Parsing sitemap…', crawling: 'Crawling pages…', analyzing: 'Computing PageRank…' };
  const label  = (phases[phase] || '') + (currentUrl ? ' ' + truncate(currentUrl, 55) : '');
  document.getElementById('status').textContent = label;
  document.getElementById('count').textContent  = total > 0 ? `${current} / ${total} pages` : '';
}

function truncate(s, n) { return s.length > n ? '…' + s.slice(-n) : s; }

// ── Error view ───────────────────────────────────
function showError(msg) {
  document.getElementById('view-loading').style.display = 'none';
  document.getElementById('view-error').style.display   = 'flex';
  document.getElementById('errMsg').textContent = msg;
}

// ── Results view ─────────────────────────────────
function showResults(data) {
  document.getElementById('view-loading').style.display = 'none';
  document.getElementById('view-results').style.display = 'flex';

  document.getElementById('nodeCount').textContent = data.totalPages;
  document.getElementById('edgeCount').textContent = data.totalLinks;
  try { document.getElementById('hostPill').textContent = new URL(data.sitemapUrl).hostname; } catch { /* */ }

  // Sidebar top 10
  const sorted = [...data.nodes].sort((a, b) => b.pageRank - a.pageRank);
  const list   = document.getElementById('sidebarList');
  list.innerHTML = '';

  sorted.slice(0, 10).forEach((n, i) => {
    const label = n.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 40) || '/';
    const row   = document.createElement('div');
    row.className = 'row';
    row.title = n.url;
    row.innerHTML =
      `<span class="rank">#${i + 1}</span>` +
      `<div class="info">` +
        `<div class="label">${esc(label)}</div>` +
        `<div class="meta">↓ ${n.inDegree} in · ↑ ${n.outDegree} out · PR ${n.pageRank.toFixed(4)}</div>` +
        `<div class="bar-outer"><div class="bar-inner" style="width:${Math.round(n.pageRankNorm * 100)}%"></div></div>` +
      `</div>`;
    row.addEventListener('click', () => window.open(n.url, '_blank'));
    list.appendChild(row);
  });

  document.getElementById('btnExportJSON').addEventListener('click', () => exportJSON(data));
  document.getElementById('btnExportCSV').addEventListener('click',  () => exportCSV(data));

  initGraph(data);
}

// ── D3 graph ─────────────────────────────────────
function initGraph(data) {
  const wrap = document.getElementById('graphWrap');
  let W = wrap.clientWidth, H = wrap.clientHeight;

  const svg = d3.select('#graph').attr('width', W).attr('height', H);
  const g   = svg.append('g');

  const zoom = d3.zoom().scaleExtent([0.1, 8]).on('zoom', e => g.attr('transform', e.transform));
  svg.call(zoom);

  const colorScale = d3.scaleSequential()
    .domain([0, 1])
    .interpolator(d3.interpolate('#6366f1', '#06b6d4'));

  const maxOut = Math.max(1, d3.max(data.nodes, d => d.outDegree));
  const rScale = d3.scaleSqrt().domain([0, maxOut]).range([4, 22]);

  // Arrowhead marker
  svg.append('defs').append('marker')
    .attr('id', 'arrow')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 10).attr('refY', 0)
    .attr('markerWidth', 6).attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path').attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', 'rgba(255,255,255,0.2)');

  const link = g.append('g')
    .selectAll('line').data(data.edges).join('line')
    .attr('stroke', 'rgba(255,255,255,0.12)')
    .attr('stroke-width', 0.8)
    .attr('marker-end', 'url(#arrow)');

  const node = g.append('g')
    .selectAll('circle').data(data.nodes).join('circle')
    .attr('r',      d => rScale(d.outDegree))
    .attr('fill',   d => colorScale(d.pageRankNorm))
    .attr('stroke', 'rgba(255,255,255,0.2)')
    .attr('stroke-width', 1)
    .style('cursor', 'pointer')
    .call(makeDrag());

  // Labels for top 15 nodes
  const top15Keys = new Set(
    [...data.nodes].sort((a, b) => b.pageRank - a.pageRank).slice(0, 15).map(n => n.key)
  );
  const labels = g.append('g')
    .selectAll('text')
    .data(data.nodes.filter(n => top15Keys.has(n.key))).join('text')
    .text(d => { const p = d.url.replace(/^https?:\/\/[^/]+/, '') || '/'; return p.length > 30 ? p.slice(0, 30) + '…' : p; })
    .attr('fill', '#f0f0f8').attr('font-size', 11)
    .attr('font-family', "'Segoe UI',system-ui,sans-serif")
    .attr('dy', d => rScale(d.outDegree) + 14)
    .attr('text-anchor', 'middle').attr('pointer-events', 'none').style('opacity', 0.7);

  // Tooltip
  const tooltip = document.getElementById('tooltip');
  node.on('mouseover', (event, d) => {
    tooltip.innerHTML =
      `<div class="tooltip-url">${esc(d.url)}</div>` +
      `<div class="tooltip-meta">↓ in: ${d.inDegree} · ↑ out: ${d.outDegree}</div>` +
      `<div class="tooltip-rank">PageRank: ${d.pageRank.toFixed(6)}</div>`;
    tooltip.style.opacity = '1';
    moveTooltip(event);
  });
  node.on('mousemove',  e => moveTooltip(e));
  node.on('mouseleave', () => { tooltip.style.opacity = '0'; });
  node.on('click', (event, d) => window.open(d.url, '_blank'));

  function moveTooltip(event) {
    const rect = wrap.getBoundingClientRect();
    let x = event.clientX - rect.left + 12;
    let y = event.clientY - rect.top  + 12;
    if (x + 300 > W) x -= 320;
    if (y + 120 > H) y -= 130;
    tooltip.style.left = x + 'px';
    tooltip.style.top  = y + 'px';
  }

  // Force simulation
  const sim = d3.forceSimulation(data.nodes)
    .force('link',      d3.forceLink(data.edges).id(d => d.key).distance(60).strength(0.3))
    .force('charge',    d3.forceManyBody().strength(-180))
    .force('center',    d3.forceCenter(W / 2, H / 2))
    .force('collision', d3.forceCollide().radius(d => rScale(d.outDegree) + 6))
    .on('tick', ticked);

  function ticked() {
    link
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => {
        const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        return d.target.x - (dx / dist) * rScale(d.target.outDegree);
      })
      .attr('y2', d => {
        const dx = d.target.x - d.source.x, dy = d.target.y - d.source.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        return d.target.y - (dy / dist) * rScale(d.target.outDegree);
      });
    node.attr('cx', d => d.x).attr('cy', d => d.y);
    labels.attr('x', d => d.x).attr('y', d => d.y);
  }

  // Controls
  let frozen = false;
  document.getElementById('btnCenter').addEventListener('click', () => {
    svg.transition().duration(600).call(zoom.transform, d3.zoomIdentity);
    sim.alpha(0.3).restart();
  });
  document.getElementById('btnFreeze').addEventListener('click', () => {
    frozen = !frozen;
    document.getElementById('btnFreeze').textContent = frozen ? '▶ Resume' : '⏸ Freeze';
    frozen ? sim.stop() : sim.alpha(0.3).restart();
  });

  function makeDrag() {
    return d3.drag()
      .on('start', (event, d) => { if (!event.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag',  (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end',   (event, d) => { if (!event.active) sim.alphaTarget(0); d.fx = null; d.fy = null; });
  }

  // Resize observer
  new ResizeObserver(() => {
    W = wrap.clientWidth; H = wrap.clientHeight;
    svg.attr('width', W).attr('height', H);
    sim.force('center', d3.forceCenter(W / 2, H / 2)).alpha(0.1).restart();
  }).observe(wrap);
}

// ── Exports ──────────────────────────────────────
function exportJSON(data) {
  const ranked = [...data.nodes].sort((a, b) => b.pageRank - a.pageRank);
  const output = JSON.stringify({
    meta:  { sitemapUrl: data.sitemapUrl, crawledAt: data.crawledAt, totalPages: data.totalPages, totalLinks: data.totalLinks },
    pages: ranked.map(n => ({ url: n.url, inDegree: n.inDegree, outDegree: n.outDegree, pageRank: n.pageRank, pageRankNorm: n.pageRankNorm })),
  }, null, 2);
  downloadBlob(output, 'link-analysis.json', 'application/json');
}

function exportCSV(data) {
  const ranked = [...data.nodes].sort((a, b) => b.pageRank - a.pageRank);
  const header = 'rank,url,in_degree,out_degree,page_rank,page_rank_norm';
  const rows   = ranked.map((n, i) =>
    [i + 1, `"${n.url}"`, n.inDegree, n.outDegree, n.pageRank.toFixed(8), n.pageRankNorm.toFixed(6)].join(',')
  );
  downloadBlob([header, ...rows].join('\n'), 'link-analysis.csv', 'text/csv');
}

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── HTML escape ──────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Main ─────────────────────────────────────────
async function main() {
  if (!sitemapUrl) {
    showError('No sitemap URL provided. Close this tab and try again from the extension popup.');
    return;
  }

  document.getElementById('urlDisplay').textContent = sitemapUrl;
  document.title = 'OpenClaw — ' + sitemapUrl;

  try {
    setProgress(0, 0, sitemapUrl, 'sitemap');

    const urls = await parseSitemap(sitemapUrl);
    if (urls.length === 0) {
      throw new Error('No URLs found in the sitemap. Make sure the URL points to a valid sitemap.xml file.');
    }

    const { nodes, edges } = await crawlPages(urls, maxPages, reqDelay, p => {
      setProgress(p.current, p.total, p.currentUrl, p.phase);
    });

    setProgress(nodes.size, nodes.size, '', 'analyzing');
    computePageRank(nodes, PR_ITER, PR_DAMP);

    graphData = {
      nodes:      [...nodes.values()],
      edges,
      crawledAt:  new Date().toISOString(),
      sitemapUrl,
      totalPages: nodes.size,
      totalLinks: edges.length,
    };

    showResults(graphData);

  } catch (err) {
    showError(err.message || String(err));
  }
}

main();
