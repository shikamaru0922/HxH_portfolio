/* ═══════════════════════════════════════════════════════════════
   HXH.design — 交互引擎「关卡编辑器 / 白盒蓝图」
   ---------------------------------------------------------------
   全部模块按 CONFIG 中的选择器驱动：
   · 新增作品卡片（复用现有类名）→ 自动获得入场动画/选框/辉光
   · 新增 section（<section id> + 导航链接）→ 小地图/滚动监听自动收录
   · 新增成就 → 在 CONFIG.achievements 里加一行即可
   依赖：无（原生 JS）。与 nav-boost.js 共存。
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CONFIG = {
    // 进入视口时淡入上升的元素（父容器内自动错峰）
    reveal: [
      '.section-label', '.section-title', '.section-desc',
      '.project-card', '.ai-card', '.case-card',
      '.analysis-category', '.analysis-groups > .analysis-item',
      '.stat-card', '.about-philosophy', '.about-info .info-row',
      '.ai-pipeline', '.contact-btn', '.project-whitebox-col'
    ],
    // 悬停出现「编辑器选框」四角的卡片
    brackets: [
      '.project-card', '.ai-card', '.case-card',
      '.stat-card', '.about-philosophy', '.analysis-category'
    ],
    // 鼠标追踪辉光（更新 --mx/--my）
    glow: ['.project-card', '.ai-section'],
    // 磁吸元素
    magnetic: ['.badge', '.contact-btn', '.philosophy-link'],
    // 成就定义（localStorage 持久化）
    achievements: {
      landing:  { icon: '🚩', name: '进入关卡：欢迎来到 HXH.design' },
      explorer: { icon: '🗺️', name: '全图探索：走遍了所有区域' },
      bottom:   { icon: '🏁', name: '抵达关底：感谢读到最后' },
      whitebox: { icon: '📦', name: '白盒之眼：发现了设计师看世界的方式' }
    },
    storeKey: 'hxh-achievements'
  };

  var docEl = document.documentElement;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(pointer: fine)').matches;

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, cls, parent) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }
  function raf(fn) { return window.requestAnimationFrame(fn); }

  /* ─────────────────────────────────────────
     1. 入场动画引擎（IntersectionObserver）
     ───────────────────────────────────────── */
  function initReveal() {
    if (reduced || !('IntersectionObserver' in window)) return;
    var targets = $$(CONFIG.reveal.join(','));
    // 同一父容器内的兄弟元素错峰入场
    var groups = new Map();
    targets.forEach(function (t) {
      var p = t.parentElement;
      if (!groups.has(p)) groups.set(p, 0);
      var idx = groups.get(p);
      t.style.setProperty('--rvd', Math.min(idx * 90, 450));
      groups.set(p, idx + 1);
      t.classList.add('rv');
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('rv-in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(function (t) { io.observe(t); });
  }

  /* ─────────────────────────────────────────
     2. 导航：滚动收缩 + 滚动进度条
     ───────────────────────────────────────── */
  function initNav() {
    var nav = $('nav');
    var bar = el('div', 'scroll-progress', document.body);
    // 滚动事件本身已按帧对齐，直接处理（避免后台标签页 rAF 冻结导致状态卡住）
    function onScroll() {
      var y = window.scrollY;
      if (nav) nav.classList.toggle('nav-scrolled', y > 80);
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? y / max : 0) + ')';
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ─────────────────────────────────────────
     3. 滚动监听：高亮导航 + 小地图 + HUD 读数
     ───────────────────────────────────────── */
  var spy = { current: '', visited: {}, listeners: [] };
  function initScrollSpy() {
    var sections = $$('section[id]');
    var links = $$('.nav-links a');
    if (!sections.length) return;

    function update() {
      var y = window.scrollY + 140;
      var id = '';
      sections.forEach(function (s) {
        if (y >= s.offsetTop && y < s.offsetTop + s.offsetHeight) id = s.id;
      });
      if (window.scrollY < 200) id = '';
      if (id && !spy.visited[id]) {
        spy.visited[id] = true;
        checkExplorer();
      }
      if (id === spy.current) return;
      spy.current = id;
      links.forEach(function (a) {
        a.classList.toggle('active', a.getAttribute('href') === '#' + id);
      });
      spy.listeners.forEach(function (fn) { fn(id); });
    }
    window.addEventListener('scroll', update, { passive: true });
    update();

    function checkExplorer() {
      var all = links.every(function (a) {
        var id = (a.getAttribute('href') || '').slice(1);
        return !id || spy.visited[id];
      });
      if (all && links.length) unlock('explorer');
    }
  }

  /* ─────────────────────────────────────────
     4. 右侧关卡小地图（依据导航链接自动生成）
     ───────────────────────────────────────── */
  function initRail() {
    var links = $$('.nav-links a');
    if (!links.length) return;
    var rail = el('aside', 'level-rail');
    rail.setAttribute('role', 'navigation');
    rail.setAttribute('aria-label', '章节小地图');
    links.forEach(function (a) {
      var node = el('a', 'rail-node');
      node.href = a.getAttribute('href');
      node.dataset.section = (a.getAttribute('href') || '').slice(1);
      var label = el('span', 'rail-label', node);
      label.textContent = a.textContent;
      el('span', 'rail-dot', node);
      rail.appendChild(node);
    });
    document.body.appendChild(rail);
    spy.listeners.push(function (id) {
      $$('.rail-node', rail).forEach(function (n) {
        n.classList.toggle('active', n.dataset.section === id);
        if (spy.visited[n.dataset.section]) n.classList.add('visited');
      });
    });
  }

  /* ─────────────────────────────────────────
     5. HUD：视口边框 / 刻度尺 / 坐标读数
     ───────────────────────────────────────── */
  var readoutMode = null;
  function initHud() {
    var frame = el('div', 'hud-frame', document.body);
    frame.setAttribute('aria-hidden', 'true');
    ['tl', 'tr', 'bl', 'br'].forEach(function (c) { el('i', 'hud-corner ' + c, frame); });
    el('i', 'hud-ruler-x', frame);
    el('i', 'hud-ruler-y', frame);

    var readout = el('div', 'hud-readout', document.body);
    readout.setAttribute('aria-hidden', 'true');
    el('i', 'rd-dot', readout);
    var pos = el('span', 'rd-pos', readout);
    readoutMode = el('span', 'rd-mode', readout);

    function update() {
      var label = spy.current || 'START';
      var link = spy.current && $('.nav-links a[href="#' + spy.current + '"]');
      if (link) label = link.textContent;
      pos.textContent = 'Y:' + String(Math.round(window.scrollY)).padStart(5, '0') + ' · ' + label;
    }
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  /* ─────────────────────────────────────────
     6. 自定义准星光标（仅精确指针）
     ───────────────────────────────────────── */
  function initCursor() {
    if (!finePointer || reduced) return;
    docEl.classList.add('cursor-on');
    var dot = el('div', 'cursor-dot', document.body);
    var ring = el('div', 'cursor-ring', document.body);
    ['t1', 't2', 't3', 't4'].forEach(function (t) { el('i', 'c-tick ' + t, ring); });
    var mx = -100, my = -100, rx = -100, ry = -100;
    document.addEventListener('mousemove', function (e) {
      mx = e.clientX; my = e.clientY;
      document.body.classList.remove('cursor-hidden');
    }, { passive: true });
    document.addEventListener('mouseleave', function () {
      document.body.classList.add('cursor-hidden');
    });
    document.addEventListener('mouseover', function (e) {
      var hit = e.target.closest && e.target.closest('a, button, .analysis-header, .badge, .tag, .stat-card, input, textarea, [role="button"]');
      ring.classList.toggle('is-link', !!hit);
    });
    (function loop() {
      rx += (mx - rx) * 0.3;
      ry += (my - ry) * 0.3;
      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
      ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0)';
      raf(loop);
    })();
  }

  /* ─────────────────────────────────────────
     7. 卡片：选框四角 + 鼠标追踪辉光
     ───────────────────────────────────────── */
  function initCards() {
    $$(CONFIG.brackets.join(',')).forEach(function (card) {
      card.classList.add('bk-host');
      ['tl', 'tr', 'bl', 'br'].forEach(function (c) { el('i', 'bk ' + c, card); });
    });
    if (!finePointer) return;
    $$(CONFIG.glow.join(',')).forEach(function (card) {
      card.addEventListener('mousemove', function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(2) + '%');
        card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(2) + '%');
      }, { passive: true });
    });
  }

  /* ─────────────────────────────────────────
     8. 磁吸悬停
     ───────────────────────────────────────── */
  function initMagnetic() {
    if (!finePointer || reduced) return;
    $$(CONFIG.magnetic.join(',')).forEach(function (m) {
      var strength = 0.28;
      m.addEventListener('mousemove', function (e) {
        var r = m.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        m.style.transform = 'translate(' + (dx * strength).toFixed(1) + 'px,' + (dy * strength).toFixed(1) + 'px)';
      }, { passive: true });
      m.addEventListener('mouseleave', function () {
        m.style.transform = '';
      });
    });
  }

  /* ─────────────────────────────────────────
     9. Hero：姓名逐字入场 + 视差 + 白盒漂浮
     ───────────────────────────────────────── */
  function initHero() {
    var hero = $('.hero');
    if (!hero) return;

    // 逐字拆分（保持文本不变，仅包裹 span）
    var name = $('.hero-name');
    if (name && !reduced) {
      var text = name.textContent;
      name.textContent = '';
      Array.prototype.forEach.call(text, function (ch, i) {
        var s = el('span', 'char', name);
        s.textContent = ch;
        s.style.setProperty('--ci', i);
      });
      name.classList.add('split');
    }

    // 漂浮白盒线框
    var cubes = el('div', 'hero-cubes', hero);
    cubes.setAttribute('aria-hidden', 'true');
    var CUBE = '<svg viewBox="0 0 100 116" width="{w}" height="{h}" xmlns="http://www.w3.org/2000/svg">' +
      '<polygon points="50,2 96,26 96,88 50,114 4,88 4,26"/>' +
      '<polyline points="4,26 50,50 96,26"/>' +
      '<line x1="50" y1="50" x2="50" y2="114" stroke-dasharray="4 4"/>' +
      '<polyline points="4,88 50,62 96,88" stroke-dasharray="4 4"/></svg>';
    [
      { x: '8%',  y: '16%', s: 64,  c: '',          d: '13s', depth: 22 },
      { x: '82%', y: '20%', s: 96,  c: 'c-accent',  d: '17s', depth: 38 },
      { x: '70%', y: '68%', s: 52,  c: 'c-teal',    d: '11s', depth: 14 },
      { x: '20%', y: '74%', s: 78,  c: '',          d: '15s', depth: 30 }
    ].forEach(function (cfg) {
      var c = el('div', 'wf-cube ' + cfg.c, cubes);
      c.style.left = cfg.x;
      c.style.top = cfg.y;
      c.style.setProperty('--dur', cfg.d);
      c.dataset.depth = cfg.depth;
      c.innerHTML = CUBE.replace('{w}', cfg.s).replace('{h}', Math.round(cfg.s * 1.16));
    });

    // 鼠标视差（光斑 / 网格 / 白盒）
    if (!finePointer || reduced) return;
    var layers = [
      { node: $('.hero-glow-1'), f: 30 },
      { node: $('.hero-glow-2'), f: 22 },
      { node: $('.hero-bg-grid'), f: 12 }
    ].filter(function (l) { return l.node; });
    var cubeNodes = $$('.wf-cube', cubes);
    hero.addEventListener('mousemove', function (e) {
      var px = e.clientX / window.innerWidth - 0.5;
      var py = e.clientY / window.innerHeight - 0.5;
      layers.forEach(function (l) {
        l.node.style.transform = 'translate3d(' + (-px * l.f) + 'px,' + (-py * l.f) + 'px,0)';
      });
      cubeNodes.forEach(function (c) {
        var d = +c.dataset.depth;
        c.style.marginLeft = (-px * d) + 'px';
        c.style.marginTop = (-py * d) + 'px';
      });
    }, { passive: true });
  }

  /* ─────────────────────────────────────────
     10. 数字统计滚动计数（仅纯数字型）
     ───────────────────────────────────────── */
  function initCounters() {
    if (reduced || !('IntersectionObserver' in window)) return;
    $$('.stat-number').forEach(function (n) {
      var m = n.textContent.trim().match(/^(\d+)(\+?)$/);
      if (!m) return;
      var target = +m[1], suffix = m[2];
      var io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        var t0 = performance.now(), dur = 1200;
        (function tick(t) {
          var p = Math.min((t - t0) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          n.textContent = Math.round(target * eased) + suffix;
          if (p < 1) raf(tick);
        })(t0);
      }, { threshold: 0.6 });
      io.observe(n);
    });
  }

  /* ─────────────────────────────────────────
     11. 移动端菜单（链接克隆自 .nav-links）
     ───────────────────────────────────────── */
  function initMobileMenu() {
    var nav = $('nav');
    var links = $$('.nav-links a');
    if (!nav || !links.length) return;
    var burger = el('button', 'nav-burger');
    burger.setAttribute('aria-label', '打开导航');
    burger.setAttribute('aria-expanded', 'false');
    el('span', '', burger); el('span', '', burger); el('span', '', burger);
    nav.appendChild(burger);

    var menu = el('div', 'mobile-menu');
    links.forEach(function (a, i) {
      var c = a.cloneNode(true);
      c.style.setProperty('--i', i);
      c.classList.remove('active');
      menu.appendChild(c);
    });
    document.body.appendChild(menu);

    function toggle(force) {
      var open = typeof force === 'boolean' ? force : !menu.classList.contains('open');
      menu.classList.toggle('open', open);
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('menu-locked', open);
    }
    burger.addEventListener('click', function () { toggle(); });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) toggle(false);
    });
  }

  /* ─────────────────────────────────────────
     12. 成就系统（localStorage 持久化）
     ───────────────────────────────────────── */
  var toastWrap = null;
  function getUnlocked() {
    try { return JSON.parse(localStorage.getItem(CONFIG.storeKey)) || {}; }
    catch (e) { return {}; }
  }
  function unlock(key) {
    var a = CONFIG.achievements[key];
    if (!a) return;
    var got = getUnlocked();
    if (got[key]) return;
    got[key] = Date.now();
    try { localStorage.setItem(CONFIG.storeKey, JSON.stringify(got)); } catch (e) {}
    toast(a.icon, a.name);
  }
  function toast(icon, name) {
    if (!toastWrap) {
      toastWrap = el('div', 'toast-wrap', document.body);
      toastWrap.setAttribute('aria-live', 'polite');
    }
    var t = el('div', 'toast', toastWrap);
    var ic = el('span', 't-icon', t); ic.textContent = icon;
    var box = el('div', '', t);
    var k = el('div', 't-kicker', box); k.textContent = 'Achievement Unlocked · 成就解锁';
    var nm = el('div', 't-name', box); nm.textContent = name;
    setTimeout(function () { t.remove(); }, 4200);
  }
  function initAchievements() {
    setTimeout(function () { unlock('landing'); }, 1800);
    var fired = false;
    window.addEventListener('scroll', function () {
      if (fired) return;
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 60) {
        fired = true;
        unlock('bottom');
      }
    }, { passive: true });
  }

  /* ─────────────────────────────────────────
     13. 白盒模式彩蛋（Konami / 连点 logo ×5）
     ───────────────────────────────────────── */
  function toggleWhitebox() {
    var on = document.body.classList.toggle('whitebox');
    if (readoutMode) readoutMode.textContent = on ? ' · MODE:WHITEBOX' : '';
    if (on) unlock('whitebox');
  }
  window.__whitebox = toggleWhitebox; // 控制台入口

  function initEasterEggs() {
    // Konami: ↑↑↓↓←→←→BA
    var seq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    var pos = 0;
    document.addEventListener('keydown', function (e) {
      var k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      pos = (k === seq[pos]) ? pos + 1 : (k === seq[0] ? 1 : 0);
      if (pos === seq.length) { pos = 0; toggleWhitebox(); }
    });
    // 连点 logo ×5
    var logo = $('.nav-logo');
    if (logo) {
      var clicks = 0, timer = null;
      logo.addEventListener('click', function () {
        clicks++;
        clearTimeout(timer);
        timer = setTimeout(function () { clicks = 0; }, 1600);
        if (clicks >= 5) { clicks = 0; toggleWhitebox(); }
      });
    }
    // 控制台彩蛋
    try {
      console.log(
        '%c HXH.DESIGN %c 关卡设计师的作品集，本身也该是个关卡。\n' +
        '隐藏机制：↑↑↓↓←→←→BA 或连点左上角 logo ×5 → 白盒模式\n' +
        '也可以直接调用 __whitebox()',
        'background:#ff6b35;color:#0a0a0f;font-weight:bold;padding:4px 8px;border-radius:3px',
        'color:#2fd6bd;line-height:1.8'
      );
    } catch (e) {}
  }

  /* ─────────────────────────────────────────
     启动
     ───────────────────────────────────────── */
  function boot() {
    initNav();
    initScrollSpy();
    initRail();
    initHud();
    initCursor();
    initReveal();
    initCards();
    initMagnetic();
    initHero();
    initCounters();
    initMobileMenu();
    initAchievements();
    initEasterEggs();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
