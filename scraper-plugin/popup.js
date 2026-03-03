'use strict';

document.getElementById('form').addEventListener('submit', e => {
  e.preventDefault();

  const sitemap  = document.getElementById('sitemap').value.trim();
  const maxPages = document.getElementById('maxPages').value;
  const delay    = document.getElementById('delay').value;

  const qs  = new URLSearchParams({ sitemap, maxPages, delay });
  const url = chrome.runtime.getURL('analyzer.html') + '?' + qs.toString();

  chrome.tabs.create({ url });
  window.close();
});
