/* ==========================================================================
   pi-agent Design System — shared JS for UI prototypes
   Theme toggle · mobile sidebar · nav active state · generic interactions
   ========================================================================== */
(function () {
  'use strict';

  /* ---- Theme ---- */
  function getPref() {
    try { return localStorage.getItem('pi-theme'); } catch (e) { return null; }
  }
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('pi-theme', theme); } catch (e) {}
    document.querySelectorAll('[data-theme-toggle]').forEach(function (el) {
      el.setAttribute('aria-label', theme === 'dark' ? '切换到亮色' : '切换到暗色');
    });
  }
  var initial = getPref() || 'dark';
  applyTheme(initial);

  // Delegate click on any [data-theme-toggle]
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-theme-toggle]');
    if (!t) return;
    e.preventDefault();
    var cur = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });

  /* ---- Mobile sidebar ---- */
  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-open-sidebar]');
    var closer = e.target.closest('[data-close-sidebar]');
    var sb = document.getElementById('sidebar');
    var scrim = document.getElementById('scrim');
    if (opener && sb) { sb.classList.add('open'); if (scrim) scrim.classList.add('show'); }
    if (closer && sb) { sb.classList.remove('open'); if (scrim) scrim.classList.remove('show'); }
  });

  /* ---- Sidebar collapse (desktop) ---- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-collapse-sidebar]');
    if (!t) return;
    var sb = document.getElementById('sidebar');
    if (sb) sb.classList.toggle('collapsed');
  });

  /* ---- Generic: segmented control ---- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-seg]');
    if (!btn) return;
    var group = btn.closest('[data-seg-group]');
    if (group) group.querySelectorAll('[data-seg]').forEach(function (b) { b.classList.remove('active'); });
    else document.querySelectorAll('[data-seg]').forEach(function (b) { b.classList.remove('active'); });
    btn.classList.add('active');
    var target = btn.getAttribute('data-seg-target');
    if (target) {
      document.querySelectorAll('[data-seg-panel]').forEach(function (p) {
        p.style.display = (p.getAttribute('data-seg-panel') === target) ? '' : 'none';
      });
    }
  });

  /* ---- Generic: tabs ---- */
  document.addEventListener('click', function (e) {
    var tab = e.target.closest('[data-tab]');
    if (!tab) return;
    var group = tab.closest('[data-tab-group]');
    if (group) group.querySelectorAll('[data-tab]').forEach(function (t) { t.classList.remove('active'); });
    else document.querySelectorAll('[data-tab]').forEach(function (t) { t.classList.remove('active'); });
    tab.classList.add('active');
    var target = tab.getAttribute('data-tab-target');
    if (target) {
      document.querySelectorAll('[data-tab-panel]').forEach(function (p) {
        p.style.display = (p.getAttribute('data-tab-panel') === target) ? '' : 'none';
      });
    }
  });

  /* ---- Generic: nav active (within a nav list) ---- */
  document.addEventListener('click', function (e) {
    var item = e.target.closest('[data-nav]');
    if (!item) return;
    var parent = item.closest('[data-nav-group]') || item.parentElement;
    parent.querySelectorAll('[data-nav]').forEach(function (n) { n.classList.remove('active'); });
    item.classList.add('active');
  });

  /* ---- Generic: dismissable toasts / banners ---- */
  document.addEventListener('click', function (e) {
    var x = e.target.closest('[data-dismiss]');
    if (x) { var t = x.closest('[data-dismiss-target]') || x.parentElement; if (t) t.remove(); }
  });

  /* ---- Ripple-free hover handled by CSS; expose helper for toasts ---- */
  window.piToast = function (msg) {
    var wrap = document.getElementById('toast-root');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toast-root'; document.body.appendChild(wrap); }
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    wrap.appendChild(el);
    setTimeout(function () { el.classList.add('show'); }, 10);
    setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.remove(); }, 300); }, 2200);
  };
})();
