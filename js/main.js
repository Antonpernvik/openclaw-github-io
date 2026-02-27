/* ═══════════════════════════════════════════════════
   OpenClaw — Main JavaScript
   Particles · Scroll reveal · Counter · Meter bars
═══════════════════════════════════════════════════ */

'use strict';

/* ── NAV: SCROLL STATE & MOBILE MENU ─────────────── */
(function initNav() {
  const nav    = document.getElementById('nav');
  const burger = document.getElementById('burger');
  const menu   = document.getElementById('mobileMenu');

  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  }, { passive: true });

  burger.addEventListener('click', () => {
    menu.classList.toggle('open');
  });

  // Close on link click
  menu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => menu.classList.remove('open'));
  });
})();

/* ── PARTICLE CANVAS ────────────────────────────── */
(function initParticles() {
  const canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, particles = [];

  const COLORS = ['#6366f1', '#06b6d4', '#a855f7', '#818cf8'];
  const COUNT  = window.innerWidth < 600 ? 40 : 80;

  function resize() {
    W = canvas.width  = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }

  function randomBetween(a, b) { return a + Math.random() * (b - a); }

  function createParticle() {
    return {
      x:     randomBetween(0, W),
      y:     randomBetween(0, H),
      r:     randomBetween(1, 2.5),
      vx:    randomBetween(-0.3, 0.3),
      vy:    randomBetween(-0.5, -0.1),
      alpha: randomBetween(0.1, 0.5),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    };
  }

  function init() {
    resize();
    particles = Array.from({ length: COUNT }, createParticle);
  }

  function tick() {
    ctx.clearRect(0, 0, W, H);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;

      // Reset when out of bounds
      if (p.y < -10 || p.x < -10 || p.x > W + 10) {
        Object.assign(p, createParticle(), { y: H + 10, x: randomBetween(0, W) });
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.fill();
    });

    ctx.globalAlpha = 1;

    // Draw faint connecting lines between close particles
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx   = particles[i].x - particles[j].x;
        const dy   = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 100) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = 'rgba(99,102,241,' + (0.08 * (1 - dist / 100)) + ')';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    requestAnimationFrame(tick);
  }

  init();
  tick();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(init, 200);
  });
})();

/* ── SCROLL REVEAL ──────────────────────────────── */
(function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );

  els.forEach(el => observer.observe(el));
})();

/* ── COUNTER ANIMATION ──────────────────────────── */
(function initCounters() {
  const nums = document.querySelectorAll('.stat__num[data-target]');
  if (!nums.length) return;

  function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

  function animateCounter(el) {
    const target   = parseInt(el.dataset.target, 10);
    const duration = 2000;
    const start    = performance.now();

    function step(now) {
      const elapsed  = now - start;
      const progress = Math.min(elapsed / duration, 1);
      el.textContent = Math.round(easeOutQuart(progress) * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.5 }
  );

  nums.forEach(el => observer.observe(el));
})();

/* ── METER BAR ANIMATION ────────────────────────── */
(function initMeters() {
  const fills = document.querySelectorAll('.meter-fill[data-width]');
  if (!fills.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.style.width = entry.target.dataset.width + '%';
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.3 }
  );

  fills.forEach(el => observer.observe(el));
})();

/* ── TERMINAL TYPEWRITER ────────────────────────── */
(function initTerminal() {
  const body = document.getElementById('terminalBody');
  if (!body) return;

  const lines = [
    { type: 'cmd',       text: 'openclaw analyze --target ./src' },
    { type: 'out',       text: '→ Scanning 847 files...' },
    { type: 'out',       text: '→ Building dependency graph...' },
    { type: 'out',       text: '→ Running centrality analysis...' },
    { type: 'highlight', text: '✓ Found 12 high-impact refactor opportunities' },
    { type: 'highlight', text: '✓ 3 critical paths identified' },
    { type: 'out',       text: '→ Generating recommendations...' },
  ];

  function buildLine(line) {
    const el = document.createElement('div');
    el.className = 'terminal__line';

    if (line.type === 'cmd') {
      el.innerHTML = '<span class="t-prompt">$</span> <span class="t-cmd"></span>';
    } else if (line.type === 'out') {
      el.classList.add('terminal__line--out');
    } else {
      el.classList.add('terminal__line--highlight');
    }

    el.style.opacity = '0';
    el.style.transform = 'translateX(-8px)';
    el.style.transition = 'opacity 0.3s, transform 0.3s';
    return el;
  }

  function typeText(el, text, callback) {
    const target = el.querySelector('.t-cmd') || el;
    let i = 0;
    const speed = 35;

    function type() {
      if (i < text.length) {
        target.textContent += text[i++];
        setTimeout(type, speed + Math.random() * 20);
      } else {
        callback && callback();
      }
    }
    type();
  }

  function animateTerminal() {
    body.innerHTML = '';
    const cursor = document.createElement('div');
    cursor.className = 'terminal__line';
    cursor.innerHTML = '<span class="t-prompt">$</span> <span class="t-cursor">_</span>';
    body.appendChild(cursor);

    let delay = 400;

    lines.forEach((line, idx) => {
      setTimeout(() => {
        // Remove or hide cursor before adding line
        if (idx === 0) cursor.style.display = 'none';

        const el = buildLine(line);
        body.appendChild(el);

        // Animate in
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            el.style.opacity = '1';
            el.style.transform = 'none';
          });
        });

        if (line.type === 'cmd') {
          typeText(el, line.text, () => {
            if (idx === lines.length - 1) {
              setTimeout(() => {
                body.appendChild(cursor);
                cursor.style.display = '';
              }, 300);
            }
          });
        } else {
          el.textContent = line.text;
          if (idx === lines.length - 1) {
            setTimeout(() => {
              body.appendChild(cursor);
              cursor.style.display = '';
            }, 600);
          }
        }
      }, delay);

      delay += line.type === 'cmd' ? 1200 : 500;
    });
  }

  // Trigger when section is visible
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateTerminal();
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.4 }
  );

  observer.observe(body);
})();

/* ── CTA FORM ───────────────────────────────────── */
(function initForm() {
  const form = document.getElementById('ctaForm');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = form.querySelector('input[type=email]');
    const btn   = form.querySelector('button');

    if (!input.value) return;

    btn.textContent = 'You\'re on the list! ✓';
    btn.style.background = 'linear-gradient(135deg, #10b981, #06b6d4)';
    btn.style.boxShadow  = '0 0 40px rgba(16,185,129,0.4)';
    input.disabled = true;
    btn.disabled   = true;
  });
})();

/* ── HERO PARALLAX GLOWS ────────────────────────── */
(function initParallax() {
  const glow1 = document.getElementById('glow1');
  const glow2 = document.getElementById('glow2');
  if (!glow1 || !glow2) return;

  let targetX = 0, targetY = 0, currentX = 0, currentY = 0;

  document.addEventListener('mousemove', (e) => {
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    targetX = (e.clientX - cx) / cx;
    targetY = (e.clientY - cy) / cy;
  }, { passive: true });

  function lerp(a, b, t) { return a + (b - a) * t; }

  function animateParallax() {
    currentX = lerp(currentX, targetX, 0.04);
    currentY = lerp(currentY, targetY, 0.04);
    glow1.style.transform = `translateX(-60%) translate(${currentX * 40}px, ${currentY * 30}px)`;
    glow2.style.transform = `translate(${-currentX * 25}px, ${-currentY * 20}px)`;
    requestAnimationFrame(animateParallax);
  }
  animateParallax();
})();

/* ── SMOOTH ANCHOR SCROLL ───────────────────────── */
(function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
})();
