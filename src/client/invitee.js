/* Invitee page: pick your name, tick the times that work, save. */
(function () {
  var h = Dom.h;
  var btn = Dom.btn;
  var L = Logic;
  var app = document.getElementById('app');
  var boot = window.BOOT || {};
  var pollId = String(boot.pollId || '');
  var storageKey = 'ms-invitee-' + pollId;
  var GONE_TEXT = 'This poll is no longer available.';
  var LOAD_ERROR_TEXT = 'Check your connection and try again.';

  var state = {
    view: 'loading', // loading | poll | gone | load_error
    poll: null,
    me: null, // inviteeId of the visitor
    pending: [], // blockIds the visitor has ticked (saved or not)
    dirty: false,
    saving: false,
    message: null, // {kind: 'error'|'ok'|'info', text, retry?}
    dayFilter: 0,
    focusKey: null
  };
  var lastView = ''; // view of the previous render, to move focus when the screen changes
  var lastSpoken = ''; // last feedback text sent to the live region
  var hasLoaded = false; // the poll has been loaded successfully at least once

  function findInvitee(id) {
    return state.poll.invitees.filter(function (p) { return p.inviteeId === id; })[0] || null;
  }

  function savedTicks(id) {
    return state.poll.responses
      .filter(function (r) { return r.inviteeId === id; })
      .map(function (r) { return r.blockId; });
  }

  // Saved answers from everyone else plus the visitor's current (maybe unsaved) ticks.
  function shownResponses() {
    if (!state.me) return state.poll.responses;
    return state.poll.responses
      .filter(function (r) { return r.inviteeId !== state.me; })
      .concat(state.pending.map(function (id) { return { inviteeId: state.me, blockId: id }; }));
  }

  // data-key of the first tick box the visitor can see (on a narrow screen only the chosen day is shown).
  function firstTickKey() {
    var narrow = Grid.isNarrow();
    var visible = state.poll.blocks.filter(function (b) { return !narrow || b.day === state.dayFilter; });
    var first = L.sortBlocks(visible)[0];
    return first ? 't-' + first.blockId : null;
  }

  function firstDayWithTime(blocks) {
    var day = null;
    blocks.forEach(function (b) { if (day === null || b.day < day) day = b.day; });
    return day;
  }

  // ---- Loading ---------------------------------------------------------------

  // message: shown once the poll is back. focusKey: control to focus once it is rendered.
  function load(message, focusKey) {
    Api.call('apiGetPublicPoll', pollId).then(function (poll) {
      state.poll = poll;
      if (!hasLoaded) {
        // On a phone, start on the first weekday that has a time; later reloads keep the visitor's choice.
        hasLoaded = true;
        var first = firstDayWithTime(poll.blocks);
        if (first !== null) state.dayFilter = first;
      }
      if (!state.me) state.me = Dom.storageGet(storageKey);
      if (state.me && !findInvitee(state.me)) {
        state.me = null;
        Dom.storageRemove(storageKey);
      }
      state.pending = state.me ? savedTicks(state.me) : [];
      state.dirty = false;
      state.message = message || null;
      state.view = 'poll';
      state.focusKey = focusKey || null;
      render();
    }, function (err) {
      state.view = err.code === 'not_found' || err.code === 'sheet_missing' ? 'gone' : 'load_error';
      render();
    });
  }

  // ---- Rendering -------------------------------------------------------------

  function hasKey(key) {
    var safe = (window.CSS && CSS.escape) ? CSS.escape(String(key)) : key;
    return !!app.querySelector('[data-key="' + safe + '"]');
  }

  function render() {
    var views = { loading: renderLoading, gone: renderGone, load_error: renderLoadError, poll: renderPoll };
    // Remember which control had focus, so an in-place re-render of the same screen can give it back.
    var active = document.activeElement;
    var previousKey = active && active !== app && app.contains(active) ? active.getAttribute('data-key') : null;
    Dom.clear(app).appendChild(views[state.view]());
    // A requested control that is not on screen any more (for example Save, after the organizer removed this
    // invitee) is treated as if no control had been requested.
    if (state.focusKey && hasKey(state.focusKey)) {
      Dom.focusByKey(app, state.focusKey);
    } else if (state.view !== lastView) {
      var heading = app.querySelector('h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    } else if (previousKey) {
      Dom.focusByKey(app, previousKey);
    }
    lastView = state.view;
    state.focusKey = null;
    var spoken = state.view === 'gone' ? GONE_TEXT
      : state.view === 'load_error' ? LOAD_ERROR_TEXT
      : (state.message ? state.message.text : '');
    if (spoken && spoken !== lastSpoken) Dom.announce(spoken);
    lastSpoken = spoken;
  }

  function renderLoading() {
    return h('p', { class: 'note' }, 'Loading…');
  }

  function renderGone() {
    return h('section', null, [h('h1', null, 'Poll not available'), h('p', null, GONE_TEXT)]);
  }

  function renderLoadError() {
    return h('section', null, [
      h('h1', null, 'Couldn’t load this poll'),
      h('div', { class: 'msg msg-error' }, [
        h('span', null, LOAD_ERROR_TEXT),
        btn('Try again', function () {
          state.view = 'loading';
          render();
          load();
        }, 'link', { 'data-key': 'retry' })
      ])
    ]);
  }

  function renderPoll() {
    var p = state.poll;
    var t = L.tally(p.blocks, p.invitees, shownResponses());
    var narrow = Grid.isNarrow();
    return h('section', null, [
      h('h1', null, p.title),
      h('p', { class: 'note' }, 'Week of ' + L.formatWeekRange(p.weekStart) + ' · ' + p.lengthMin + '-minute meeting'),
      h('p', { class: 'tz' }, 'All times Eastern (Bloomington)'),
      whoEl(),
      narrow ? Grid.dayTabs(p.weekStart, state.dayFilter, function (day) {
        state.dayFilter = day;
        state.focusKey = 'tab-' + day;
        render();
      }) : null,
      Grid.render({
        mode: 'names', weekStart: p.weekStart, lengthMin: p.lengthMin, blocks: p.blocks,
        dayFilter: narrow ? state.dayFilter : null, invitees: p.invitees, ticks: t.ticks, counts: t.counts,
        best: t.best, activeInviteeId: state.me, showCounts: true, onToggle: toggle
      }),
      saveBar()
    ]);
  }

  function whoEl() {
    if (state.me) {
      return h('div', null, [
        h('p', { class: 'who' }, ['You are ', h('strong', null, findInvitee(state.me).name), '. ',
          btn('Not you? Switch', switchPerson, 'link', { 'data-key': 'switch' })]),
        h('p', null, 'Tick every time that works for you, then click “Save my availability.”')
      ]);
    }
    var options = [h('option', { value: '' }, 'Choose your name…')].concat(state.poll.invitees.map(function (x) {
      return h('option', { value: x.inviteeId }, x.name);
    }));
    // The name is only confirmed by Continue (or Enter): committing on `change` would fire for every option
    // a keyboard user arrows through, and remove the list under them.
    return h('div', { class: 'field' }, [
      h('label', { for: 'f-who' }, 'Who are you?'),
      h('div', { class: 'inline-row' }, [
        h('select', {
          id: 'f-who', 'data-key': 'who', style: { flex: '1 1 auto', minWidth: '0' },
          onkeydown: function (e) {
            if (e.key === 'Enter') {
              e.preventDefault();
              continueWithName();
            }
          }
        }, options),
        btn('Continue', continueWithName, 'primary', { 'data-key': 'continue' })
      ]),
      h('p', { class: 'note' }, 'Not on the list? Contact the organizer.')
    ]);
  }

  function saveBar() {
    var msg = Dom.messageBox(state.message);
    if (!state.me) return msg ? h('div', { class: 'toolbar-sticky' }, msg) : null;
    return h('div', { class: 'toolbar-sticky' }, [
      msg,
      h('div', { class: 'save-row' }, [
        h('span', { class: 'note' }, state.dirty ? 'You have unsaved changes.' : ''),
        btn(state.saving ? 'Saving…' : 'Save my availability', save, 'primary', { disabled: state.saving, 'data-key': 'save' })
      ])
    ]);
  }

  // ---- Actions ---------------------------------------------------------------

  function continueWithName() {
    var select = document.getElementById('f-who');
    if (select && select.value) {
      choosePerson(select.value);
      return;
    }
    state.message = { kind: 'error', text: 'Choose your name first.' };
    state.focusKey = 'who';
    lastSpoken = ''; // announce again even if the same message is already showing
    render();
  }

  function choosePerson(id) {
    state.me = id;
    Dom.storageSet(storageKey, id);
    state.pending = savedTicks(id);
    state.dirty = false;
    state.message = null;
    // The name list is gone after this render; move focus to the first tick box (or Save if none is on screen).
    state.focusKey = firstTickKey() || 'save';
    render();
  }

  function switchPerson() {
    var go = state.dirty
      ? Dom.confirmDialog({ title: 'Discard your unsaved ticks?', lines: ['Your changes have not been saved.'], okLabel: 'Discard', danger: true })
      : Promise.resolve(true);
    go.then(function (yes) {
      if (!yes) return;
      state.me = null;
      Dom.storageRemove(storageKey);
      state.pending = [];
      state.dirty = false;
      state.message = null;
      state.focusKey = 'who';
      render();
    });
  }

  function toggle(blockId, checked) {
    var i = state.pending.indexOf(blockId);
    if (checked && i === -1) state.pending.push(blockId);
    if (!checked && i !== -1) state.pending.splice(i, 1);
    state.dirty = true;
    state.message = null;
    state.focusKey = 't-' + blockId;
    render();
  }

  function save() {
    if (state.saving) return;
    var go = state.pending.length === 0
      ? Dom.confirmDialog({
          title: 'None of these times work for you?',
          lines: ['Saving with no times ticked tells the organizer that none of these times work.'],
          okLabel: 'Save',
          cancelLabel: 'Go back'
        })
      : Promise.resolve(true);
    go.then(function (yes) {
      if (!yes) return;
      state.saving = true;
      state.message = null;
      render();
      Api.call('apiSaveResponse', pollId, state.me, state.pending.slice(), state.poll.version).then(function () {
        state.saving = false;
        state.dirty = false;
        load({ kind: 'ok', text: 'Saved. You can return to this link and change your answers any time.' }, 'save');
      }, function (err) {
        state.saving = false;
        if (err.code === 'stale') {
          state.dirty = false;
          load({ kind: 'info', text: 'The organizer updated this poll. Please review your answers.' }, 'save');
          return;
        }
        if (err.code === 'not_found' || err.code === 'sheet_missing') {
          state.dirty = false;
          state.view = 'gone';
          render();
          return;
        }
        state.message = { kind: 'error', text: 'Couldn’t save. Check your connection and try again.', retry: save };
        state.focusKey = 'save';
        render();
      });
    });
  }

  // ---- Start -----------------------------------------------------------------

  window.addEventListener('beforeunload', function (e) {
    if (state.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  Grid.onNarrowChange(function () {
    if (state.view === 'poll') render();
  });
  render(); // show "Loading…" while the first load runs
  load();
})();
