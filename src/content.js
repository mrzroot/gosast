/*
 * Parpar content script: the overlay you actually see.
 *
 * Safety design:
 *  - The page's own DOM is never changed. We add ONE element at the end of
 *    <html> (a closed box with a canvas inside) and remove it when you leave.
 *  - What you tear is a picture of the page (a screenshot taken by the browser
 *    for this tab), so forms, scripts and styles on the page are not touched.
 *  - Nothing is stored, and nothing is sent anywhere. There is no fetch, no
 *    XHR and no storage call in this file.
 */
(function () {
  'use strict';
  if (globalThis.__parpar) return;

  var S = globalThis.ParparStrings, E = globalThis.ParparEngine;
  var state = { active: false, host: null, engine: null, lang: 'en', prevFocus: null, off: [] };

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box}',
    '.root{position:fixed;inset:0;z-index:2147483647;font:14px/1.3 system-ui,"Segoe UI",Roboto,Vazirmatn,Tahoma,sans-serif;color:#fff4ea}',
    'canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:crosshair;outline:none}',
    'canvas:focus-visible{outline:3px solid #ff7aa8;outline-offset:-3px}',
    '.bar{position:absolute;top:10px;left:50%;transform:translateX(-50%);display:flex;flex-wrap:wrap;gap:4px;justify-content:center;max-width:calc(100% - 16px);padding:6px;border-radius:16px;background:rgba(30,20,16,.88);border:1px solid rgba(255,190,210,.25);box-shadow:0 8px 28px rgba(0,0,0,.45);backdrop-filter:blur(8px)}',
    '.sep{width:1px;background:rgba(255,255,255,.18);margin:4px 3px}',
    'button{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border-radius:11px;color:#fff4ea;font:inherit;font-weight:600}',
    'button:hover{background:rgba(255,255,255,.12)}',
    'button:focus-visible{outline:2px solid #ff9ec0;outline-offset:1px}',
    'button[aria-pressed="true"]{background:#ff7aa8;color:#2a1018}',
    'button.exit{background:#fff4ea;color:#2a1018}',
    'button.exit:hover{background:#ffd9e6}',
    'svg{width:17px;height:17px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}',
    '.hud{position:absolute;bottom:12px;left:12px;right:12px;display:flex;justify-content:space-between;align-items:flex-end;pointer-events:none;gap:12px}',
    '.pill{padding:6px 12px;border-radius:999px;background:rgba(30,20,16,.82);border:1px solid rgba(255,190,210,.2);font-size:12.5px}',
    '.hint{transition:opacity .8s}',
    '@media (max-width:620px){button span{display:none}button{padding:8px}}',
    '@media (prefers-reduced-motion:reduce){.hint{transition:none}}'
  ].join('');

  var ICONS = {
    strip: '<path d="M5 3v18M12 3v18M19 3v18" stroke-dasharray="3 3"/>',
    confetti: '<rect x="4" y="4" width="5" height="5" rx="1"/><rect x="14" y="5" width="5" height="5" rx="1"/><rect x="6" y="14" width="5" height="5" rx="1"/><rect x="15" y="15" width="4" height="4" rx="1"/>',
    broom: '<path d="M14 3l-4 8M7 11h8l2 10H5z"/><path d="M9 16v4M13 16v4"/>',
    glue: '<path d="M8 3h8v4l2 3v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V10l2-3z"/><path d="M9 13h6"/>',
    shredAll: '<path d="M3 8h18M6 8v13M10 8v10M14 8v13M18 8v10M8 3h8"/>',
    rewind: '<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5"/>',
    gentle: '<path d="M4 15c3-6 5 4 8-1s5 3 8-2"/>',
    sound: '<path d="M4 9v6h4l5 4V5L8 9zM16.5 9a4 4 0 0 1 0 6"/>',
    exit: '<path d="M6 6l12 12M18 6L6 18"/>'
  };

  function t(key, vars) { return S.t(state.lang, key, vars); }

  function icon(name) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + '</svg>'; }

  function btn(id, name, tipKey, labelKey, pressed) {
    return '<button type="button" data-id="' + id + '" title="' + esc(t(tipKey)) + '" aria-label="' + esc(t(labelKey) + ': ' + t(tipKey)) + '"' +
      (pressed != null ? ' aria-pressed="' + pressed + '"' : '') + '>' + icon(name) + '<span>' + esc(t(labelKey)) + '</span></button>';
  }

  /** Put trusted, built-in markup into `el` by parsing it (no innerHTML assignment; every value inside is escaped). */
  function setHtml(el, html) {
    var doc = new DOMParser().parseFromString('<!doctype html><body>' + html, 'text/html');
    var nodes = Array.prototype.map.call(Array.prototype.slice.call(doc.body.childNodes), function (n) { return document.adoptNode(n); });   // copy the list first: adopting a node removes it from the old tree
    while (el.firstChild) el.removeChild(el.firstChild);
    nodes.forEach(function (n) { el.appendChild(n); });
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /** Decode a data: URL into an ImageBitmap without touching fetch or <img> (page CSP cannot block this). */
  function decode(dataUrl) {
    var b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  }

  function render() {
    var root = state.shadow.querySelector('.root');
    var e = state.engine, st = e ? e.stats() : { tool: 'strip', gentle: false };
    var bar = root.querySelector('.bar');
    bar.setAttribute('aria-label', t('toolbar'));
    var focusedId = state.shadow.activeElement && state.shadow.activeElement.getAttribute && state.shadow.activeElement.getAttribute('data-id');
    setHtml(bar,
      btn('strip', 'strip', 'shredTip', 'shred', st.tool === 'strip') +
      btn('confetti', 'confetti', 'confettiTip', 'confetti', st.tool === 'confetti') +
      btn('broom', 'broom', 'broomTip', 'broom', st.tool === 'broom') +
      btn('glue', 'glue', 'glueTip', 'glue', st.tool === 'glue') +
      '<i class="sep"></i>' +
      btn('shredAll', 'shredAll', 'shredAllTip', 'shredAll') +
      btn('rewind', 'rewind', 'rewindTip', 'rewind') +
      '<i class="sep"></i>' +
      btn('gentle', 'gentle', 'gentleTip', 'gentle', st.gentle) +
      btn('sound', 'sound', 'soundTip', 'sound', e ? e.sound : false) +
      '<button type="button" data-id="lang" title="' + esc(t('languageTip')) + '" lang="' + (state.lang === 'fa' ? 'en' : 'fa') + '"><span style="display:inline">' + esc(t('language')) + '</span></button>' +
      '<button type="button" class="exit" data-id="exit" title="' + esc(t('exitTip')) + '">' + icon('exit') + '<span>' + esc(t('exit')) + '</span></button>');
    if (focusedId) { var again = bar.querySelector('[data-id="' + focusedId + '"]'); if (again) again.focus({ preventScroll: true }); }   // keep the keyboard place
    root.setAttribute('dir', S.dir(state.lang));
    root.setAttribute('lang', state.lang);
    root.querySelector('.hint').textContent = t('pageIsSafe');
    var count = st.total ? S.num(state.lang, st.pieces) : '';
    var pill = root.querySelector('.count');
    pill.textContent = st.pieces ? t('pieces', { n: count }) : t('intact');
    state.shadow.querySelector('canvas').setAttribute('aria-label', t('canvasLabel'));
  }

  function act(id) {
    var e = state.engine;
    if (!e) return;
    if (id === 'strip' || id === 'confetti' || id === 'broom' || id === 'glue') e.setTool(id);
    else if (id === 'shredAll') e.shredAll();
    else if (id === 'rewind') e.rewind();
    else if (id === 'gentle') e.setGentle(!e.gentle);
    else if (id === 'sound') e.setSound(!e.sound);
    else if (id === 'lang') state.lang = state.lang === 'fa' ? 'en' : 'fa';
    else if (id === 'exit') { stop(); return; }
    render();
  }

  function on(target, type, fn, opts) { target.addEventListener(type, fn, opts); state.off.push(function () { target.removeEventListener(type, fn, opts); }); }

  /**
   * Keyboard: while Parpar is open the page must not see keystrokes (so a focused
   * form field is never typed into). Browser shortcuts (Ctrl/Alt/Cmd) pass through.
   */
  function onKey(ev) {
    if (!state.active || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    var path = ev.composedPath ? ev.composedPath() : [];
    var inUi = path.indexOf(state.host) >= 0;
    var onButton = inUi && path[0] && path[0].tagName === 'BUTTON';
    var k = ev.key, step = ev.shiftKey ? 80 : 24, down = ev.type === 'keydown';

    // a focused toolbar button keeps its normal Enter/Space and Tab behaviour
    if (inUi && (k === 'Tab' || (onButton && (k === 'Enter' || k === ' ')))) { ev.stopPropagation(); return; }
    // the first Tab from the page moves focus into Parpar (this is the only time focus moves)
    if (k === 'Tab' && !inUi) {
      ev.preventDefault(); ev.stopImmediatePropagation();
      if (down) state.shadow.querySelector('canvas').focus({ preventScroll: true });
      return;
    }
    if (down) {
      if (k === 'Escape') stop();
      else if (k === '1') act('strip'); else if (k === '2') act('confetti'); else if (k === '3') act('broom'); else if (k === '4') act('glue');
      else if (k === 's' || k === 'S') act('shredAll');
      else if (k === 'r' || k === 'R') act('rewind');
      else if (k === 'g' || k === 'G') act('gentle');
      else if (k === 'm' || k === 'M') act('sound');
      else if (k === 'l' || k === 'L') act('lang');
      else if (k === 'ArrowLeft') state.engine.kbMove(-step, 0);
      else if (k === 'ArrowRight') state.engine.kbMove(step, 0);
      else if (k === 'ArrowUp') state.engine.kbMove(0, -step);
      else if (k === 'ArrowDown') state.engine.kbMove(0, step);
      else if (k === 'Enter' || k === ' ') state.engine.kbToggle();
    }
    ev.preventDefault(); ev.stopImmediatePropagation();
  }

  function start(dataUrl) {
    if (state.active) return Promise.resolve(false);
    state.active = true;
    state.lang = S.detectLang(navigator.language);
    state.prevFocus = document.activeElement;
    return decode(dataUrl).then(function (bitmap) {
      if (!state.active) return false;
      var host = document.createElement('div');
      host.setAttribute('data-parpar', '');
      host.style.cssText = 'all:initial;position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:2147483647;display:block';
      var shadow = host.attachShadow({ mode: 'closed' });
      state.shadow = shadow; state.host = host;
      setHtml(shadow, '<style>' + CSS + '</style><div class="root" role="region"><canvas tabindex="0" role="img"></canvas>' +
        '<div class="bar" role="toolbar"></div>' +
        '<div class="hud"><span class="pill count" aria-live="polite"></span><span class="pill hint"></span></div></div>');
      var W = window.innerWidth, H = window.innerHeight;
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var canvas = shadow.querySelector('canvas');
      state.engine = E.create({
        canvas: canvas, source: bitmap, width: W, height: H, dpr: window.devicePixelRatio || 1, gentle: reduce,
        onChange: function () { if (state.active) render(); }
      });
      document.documentElement.appendChild(host);
      render();
      setTimeout(function () { var h = shadow.querySelector('.hint'); if (h) h.style.opacity = '0'; }, 5000);

      shadow.querySelector('.bar').addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('button');
        if (b) act(b.getAttribute('data-id'));
      });
      on(window, 'keydown', onKey, true);
      on(window, 'keyup', onKey, true);
      on(window, 'wheel', function (e) { e.preventDefault(); }, { passive: false, capture: true });
      on(window, 'resize', stop);          // the picture no longer matches the window, so just close
      on(window, 'pagehide', stop);
      return true;
    }).catch(function (err) { stop(); throw err; });
  }

  /** Close the overlay and give the page back exactly as it was. */
  function stop() {
    if (!state.active) return false;
    state.active = false;
    state.off.splice(0).forEach(function (fn) { fn(); });
    if (state.engine) { state.engine.destroy(); state.engine = null; }
    if (state.host && state.host.parentNode) state.host.parentNode.removeChild(state.host);
    state.host = null; state.shadow = null;
    var pf = state.prevFocus; state.prevFocus = null;
    try { if (pf && pf !== document.body && document.contains(pf) && document.activeElement !== pf) pf.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    return true;
  }

  globalThis.__parpar = { start: start, stop: stop, get active() { return state.active; } };
})();
