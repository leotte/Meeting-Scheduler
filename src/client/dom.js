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
    if (children === null || children === undefined || children === false) return;
    if (Array.isArray(children)) {
      children.forEach(function (c) { append(el, c); });
      return;
    }
    el.appendChild(typeof children === 'string' ? document.createTextNode(children) : children);
  }

  function btn(label, onClick, kind, extra) {
    return h('button', Object.assign({ type: 'button', class: 'btn btn-' + (kind || 'secondary'), onclick: onClick }, extra || {}), label);
  }

  // m: null or {kind: 'error'|'ok'|'info', text, retry?: function}
  function messageBox(m) {
    if (!m) return null;
    return h('div', { class: 'msg msg-' + m.kind, role: m.kind === 'error' ? 'alert' : 'status' }, [
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
    var el = container.querySelector('[data-key="' + key + '"]');
    if (el) el.focus();
  }

  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      var root = document.getElementById('dialog-root');
      var previous = document.activeElement;
      function close(result) {
        document.removeEventListener('keydown', onKey);
        clear(root);
        if (previous && previous.focus) previous.focus();
        resolve(result);
      }
      function onKey(e) {
        if (e.key === 'Escape') close(false);
      }
      var ok = h('button', { type: 'button', class: 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary'),
        onclick: function () { close(true); } }, opts.okLabel || 'OK');
      var cancel = h('button', { type: 'button', class: 'btn btn-secondary',
        onclick: function () { close(false); } }, opts.cancelLabel || 'Cancel');
      clear(root).appendChild(h('div', { class: 'dialog-backdrop' },
        h('div', { class: 'dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-title' }, [
          h('h2', { id: 'dialog-title', class: 'dialog-title' }, opts.title || 'Are you sure?'),
          (opts.lines || []).map(function (line) { return h('p', null, line); }),
          h('div', { class: 'dialog-actions' }, [cancel, ok])
        ])));
      document.addEventListener('keydown', onKey);
      ok.focus();
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
    confirmDialog: confirmDialog,
    copyText: copyText,
    storageGet: storageGet,
    storageSet: storageSet,
    storageRemove: storageRemove
  };
})();
