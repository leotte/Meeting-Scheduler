/* Small DOM helpers shared by both pages. Text always goes through textContent. */
var Dom = (function () {
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(function (s) { el.style[s] = v[s]; });
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    });
    append(el, children);
    return el;
  }

  function append(el, children) {
    if (children === null || children === undefined || children === false || children === true) return;
    if (Array.isArray(children)) {
      children.forEach(function (c) { append(el, c); });
      return;
    }
    var isText = typeof children === 'string' || typeof children === 'number';
    el.appendChild(isText ? document.createTextNode(String(children)) : children);
  }

  function btn(label, onClick, kind, extra) {
    return h('button', Object.assign({ type: 'button', class: 'btn btn-' + (kind || 'secondary'), onclick: onClick }, extra || {}), label);
  }

  // m: null or {kind: 'error'|'ok'|'info', text, retry?: function}
  function messageBox(m) {
    if (!m) return null;
    return h('div', { class: 'msg msg-' + m.kind }, [
      h('span', null, m.text),
      m.retry ? btn('Try again', m.retry, 'link') : null
    ]);
  }

  function clear(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  function focusByKey(container, key) {
    if (!key) return;
    var safe = (window.CSS && CSS.escape) ? CSS.escape(String(key)) : key;
    var el = container.querySelector('[data-key="' + safe + '"]');
    if (el) el.focus();
  }

  // Announces text through the page's persistent #live region, which sits outside re-rendered content.
  function announce(text) {
    var live = document.getElementById('live');
    if (!live) return;
    live.textContent = '';
    setTimeout(function () { live.textContent = text || ''; }, 50);
  }

  // Close function of the dialog that is currently open, or null.
  var closeOpenDialog = null;

  function confirmDialog(opts) {
    if (closeOpenDialog) closeOpenDialog(false);
    return new Promise(function (resolve) {
      var root = document.getElementById('dialog-root');
      var previous = document.activeElement;
      function close(result) {
        document.removeEventListener('keydown', onKey);
        if (closeOpenDialog === close) closeOpenDialog = null;
        clear(root);
        if (previous && previous.focus) previous.focus();
        resolve(result);
      }
      function onKey(e) {
        if (e.key === 'Escape') {
          close(false);
        } else if (e.key === 'Tab') {
          // Keep focus inside the dialog: cycle between its two buttons.
          e.preventDefault();
          var buttons = [cancel, ok];
          var last = buttons.length - 1;
          var i = buttons.indexOf(document.activeElement);
          var next = e.shiftKey ? (i <= 0 ? last : i - 1) : (i < 0 || i === last ? 0 : i + 1);
          buttons[next].focus();
        }
      }
      var ok = h('button', { type: 'button', class: 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary'),
        onclick: function () { close(true); } }, opts.okLabel || 'OK');
      var cancel = h('button', { type: 'button', class: 'btn btn-secondary',
        onclick: function () { close(false); } }, opts.cancelLabel || 'Cancel');
      clear(root).appendChild(h('div', { class: 'dialog-backdrop' },
        h('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true',
          'aria-labelledby': 'dialog-title', 'aria-describedby': 'dialog-body' }, [
          h('h2', { id: 'dialog-title', class: 'dialog-title' }, opts.title || 'Are you sure?'),
          h('div', { id: 'dialog-body' }, (opts.lines || []).map(function (line) { return h('p', null, line); })),
          h('div', { class: 'dialog-actions' }, [cancel, ok])
        ])));
      closeOpenDialog = close;
      document.addEventListener('keydown', onKey);
      (opts.danger ? cancel : ok).focus();
    });
  }

  function copyText(input) {
    input.select();
    input.setSelectionRange(0, input.value.length);
    var done = false;
    try {
      done = document.execCommand('copy');
    } catch (e) {
      done = false;
    }
    if (!done && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(input.value).then(function () { return true; }, function () { return false; });
    }
    return Promise.resolve(done);
  }

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }

  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  function storageRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* storage unavailable */ }
  }

  return {
    h: h,
    btn: btn,
    messageBox: messageBox,
    clear: clear,
    focusByKey: focusByKey,
    announce: announce,
    confirmDialog: confirmDialog,
    copyText: copyText,
    storageGet: storageGet,
    storageSet: storageSet,
    storageRemove: storageRemove
  };
})();
