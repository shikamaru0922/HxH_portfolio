/* Navigation boost: top progress bar (click feedback) + hover prefetch */
(function () {
  'use strict';

  // ---------- A. Top progress bar ----------
  var bar = document.createElement('div');
  bar.id = '__nav_progress';
  bar.style.cssText = [
    'position:fixed', 'top:0', 'left:0', 'height:3px', 'width:0',
    'background:linear-gradient(90deg,#d4a849,#e8c478,#d4a849)',
    'box-shadow:0 0 10px rgba(212,168,73,.7)',
    'z-index:99999',
    'transition:width .3s ease, opacity .25s ease',
    'opacity:0', 'pointer-events:none'
  ].join(';');
  (document.body || document.documentElement).appendChild(bar);

  var progressTimer = null;
  function startProgress() {
    bar.style.transition = 'none';
    bar.style.width = '0';
    bar.style.opacity = '1';
    // force reflow so the next transition applies
    void bar.offsetWidth;
    bar.style.transition = 'width .4s ease, opacity .25s ease';
    bar.style.width = '70%';
    clearTimeout(progressTimer);
    progressTimer = setTimeout(function () { bar.style.width = '92%'; }, 1800);
  }
  function resetProgress() {
    clearTimeout(progressTimer);
    bar.style.transition = 'width .2s ease, opacity .3s ease';
    bar.style.width = '100%';
    setTimeout(function () {
      bar.style.opacity = '0';
      setTimeout(function () { bar.style.width = '0'; }, 300);
    }, 150);
  }

  // ---------- B. Hover prefetch ----------
  var prefetched = Object.create(null);
  // opts.allowBlank: prefetch works for target=_blank too; progress bar does not
  function parseLink(a, opts) {
    if (!a || !a.href) return null;
    if (!opts || !opts.allowBlank) {
      if (a.target && a.target !== '_self') return null;
    }
    if (a.hasAttribute('download')) return null;
    var url;
    try { url = new URL(a.href, location.href); } catch (e) { return null; }
    if (url.origin !== location.origin) return null;
    // Same-page hash links: ignore
    if (url.pathname === location.pathname && url.hash && !url.search) return null;
    // Only HTML documents (including "/" which serves index)
    var path = url.pathname;
    if (path !== '/' && !/\.html?$/i.test(path)) return null;
    return url;
  }

  function prefetch(a) {
    var url = parseLink(a, { allowBlank: true });
    if (!url) return;
    var key = url.pathname + url.search;
    if (prefetched[key]) return;
    // Don't prefetch current page
    if (key === location.pathname + location.search) return;
    prefetched[key] = true;
    var link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url.href;
    link.as = 'document';
    document.head.appendChild(link);
  }

  var hoverTimer = null;
  var HOVER_DELAY = 65; // ms — avoids prefetching on quick mouse flyovers

  document.addEventListener('mouseover', function (e) {
    var a = e.target.closest && e.target.closest('a');
    if (!a) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(function () { prefetch(a); }, HOVER_DELAY);
  });
  document.addEventListener('mouseout', function () {
    clearTimeout(hoverTimer);
  });
  // Touch: prefetch on touchstart (just before the tap fires)
  document.addEventListener('touchstart', function (e) {
    var a = e.target.closest && e.target.closest('a');
    if (a) prefetch(a);
  }, { passive: true });

  // ---------- C. Click → show progress ----------
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a');
    if (!parseLink(a)) return;
    startProgress();
  });

  // Reset bar when returning via back/forward cache
  window.addEventListener('pageshow', function () {
    clearTimeout(progressTimer);
    bar.style.transition = 'none';
    bar.style.width = '0';
    bar.style.opacity = '0';
  });
  // If navigation is aborted (e.g. user hits Esc), reset after a while
  window.addEventListener('beforeunload', resetProgress);
})();
