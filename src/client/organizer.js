/* Organizer page: poll list, four-step setup, share screen, results, data-sheet recovery. */
(function () {
  var h = Dom.h;
  var btn = Dom.btn;
  var L = Logic;
  var app = document.getElementById('app');
  var boot = window.BOOT || {};
  var STEPS = ['Details', 'Times', 'Invitees', 'Review'];

  var state = {
    view: 'loading', // loading | home | wizard | share | results | sheet_missing | denied
    polls: [],
    message: null, // {kind: 'error'|'ok'|'info', text, retry?}
    draft: null,
    step: 1,
    maxStep: 1,
    stepMessage: '',
    renaming: null,
    saving: false,
    checking: false, // Save was clicked and the poll is being re-read to count the answers an edit would delete
    dirty: false,
    dayFilter: 0,
    share: null, // {mode: 'created'|'edited'|'link', pollId, title}
    results: null,
    creatingSheet: false, // a new data sheet is being created
    focusKey: null
  };
  var lastScreen = ''; // view:step of the previous render, to move focus when the screen changes
  var lastSpoken = ''; // last feedback text sent to the live region

  // ---- Helpers -------------------------------------------------------------

  function call(name) {
    var args = [name, boot.adminKey || ''].concat(Array.prototype.slice.call(arguments, 1));
    return Api.call.apply(null, args);
  }

  function linkFor(pollId) {
    return boot.baseUrl + '?poll=' + encodeURIComponent(pollId);
  }

  function failureText(err) {
    if (err.code === 'network') return 'Couldn’t reach the server. Check your connection and try again.';
    if (err.code === 'not_found') return 'That poll no longer exists.';
    if (err.code === 'invalid') return err.message;
    return 'Something went wrong on the server. Please try again.';
  }

  // Nothing can be saved in these states, so unsaved-change warnings are dropped too.
  function handleSpecial(err) {
    if (err.code !== 'sheet_missing' && err.code !== 'not_owner') return false;
    state.view = err.code === 'sheet_missing' ? 'sheet_missing' : 'denied';
    state.dirty = false;
    state.saving = false;
    state.checking = false;
    render();
    return true;
  }

  function changed() {
    state.dirty = true;
  }

  function weekLine(weekStart) {
    return 'Week of ' + L.formatWeekRange(weekStart) + ' · All times Eastern (Bloomington)';
  }

  function currentDayFilter() {
    return Grid.isNarrow() ? state.dayFilter : null;
  }

  function dayTabsIfNarrow(weekStart) {
    if (!Grid.isNarrow()) return null;
    return Grid.dayTabs(weekStart, state.dayFilter, function (day) {
      state.dayFilter = day;
      state.focusKey = 'tab-' + day;
      render();
    });
  }

  // ---- Rendering -----------------------------------------------------------

  function render() {
    var views = {
      loading: renderLoading, home: renderHome, wizard: renderWizard, share: renderShare,
      results: renderResults, sheet_missing: renderSheetMissing, denied: renderDenied
    };
    // Remember which control had focus, so an in-place re-render of the same screen can give it back.
    var active = document.activeElement;
    var previousKey = active && active !== app && app.contains(active) ? active.getAttribute('data-key') : null;
    Dom.clear(app).appendChild(views[state.view]());
    var screen = state.view + ':' + state.step;
    // A requested control that is not on this screen is treated as if no control had been requested.
    var focused = !!state.focusKey && Dom.focusByKey(app, state.focusKey);
    if (!focused && screen === lastScreen && previousKey) {
      Dom.focusByKey(app, previousKey);
    } else if (!focused && screen !== lastScreen) {
      var heading = app.querySelector('h1');
      if (heading) {
        heading.setAttribute('tabindex', '-1');
        heading.focus();
      }
    }
    lastScreen = screen;
    state.focusKey = null;
    // Step messages only belong to the wizard; a stale one must not hide the current page message.
    var spoken = (state.view === 'wizard' && state.stepMessage) || (state.message ? state.message.text : '');
    if (spoken && spoken !== lastSpoken) Dom.announce(spoken);
    lastSpoken = spoken;
  }

  function messageEl() {
    return Dom.messageBox(state.message);
  }

  // Sticky footer for every wizard step: the step message sits right above the buttons, so it is always in view.
  function wizardFooter(buttons) {
    return h('div', { class: 'toolbar-sticky' }, [
      state.stepMessage ? h('p', { class: 'msg msg-error' }, state.stepMessage) : null,
      h('div', { class: 'save-row' }, buttons)
    ]);
  }

  function renderLoading() {
    return h('p', { class: 'note' }, 'Loading…');
  }

  function renderDenied() {
    return h('section', null, [h('h1', null, 'Organizer only'), h('p', null, 'This page is for the organizer only.')]);
  }

  // ---- Home ------------------------------------------------------------------

  function loadPolls() {
    call('apiListPolls').then(function (polls) {
      state.polls = polls;
      state.view = 'home';
      render();
    }, function (err) {
      if (handleSpecial(err)) return;
      state.polls = [];
      state.view = 'home';
      state.message = { kind: 'error', text: failureText(err), retry: goHome };
      render();
    });
  }

  function goHome() {
    state.view = 'loading';
    state.message = null;
    state.draft = null;
    state.dirty = false;
    render();
    loadPolls();
  }

  function renderHome() {
    var rows = state.polls.map(function (p) {
      return h('li', { class: 'poll-row' }, [
        h('div', null, [
          h('div', { class: 'poll-title' }, p.title),
          h('div', { class: 'note' }, 'Week of ' + L.formatWeekRange(p.weekStart) + ' · ' + p.lengthMin +
            ' min · ' + p.respondedCount + ' of ' + p.invitedCount + ' responded')
        ]),
        h('div', { class: 'actions' }, [
          btn('Results', function () { openResults(p.pollId); }, 'primary', { 'aria-label': 'Results for ' + p.title }),
          btn('Edit', function () { startEdit(p.pollId); }, 'secondary', { 'aria-label': 'Edit ' + p.title }),
          btn('Copy link', function () { copyLinkFromHome(p); }, 'secondary', { 'aria-label': 'Copy link for ' + p.title }),
          btn('Delete', function () { confirmDelete(p); }, 'secondary', { 'aria-label': 'Delete ' + p.title })
        ])
      ]);
    });
    return h('section', null, [
      h('div', { class: 'toolbar toolbar-top' }, [h('h1', null, 'My polls'), btn('New poll', startNew, 'primary', { 'data-key': 'new-poll' })]),
      messageEl(),
      rows.length
        ? h('ul', { class: 'poll-list' }, rows)
        : h('p', { class: 'note' }, 'No polls yet. Click “New poll” to propose meeting times.')
    ]);
  }

  function copyLinkFromHome(p) {
    var tmp = h('input', { type: 'text', value: linkFor(p.pollId), readonly: true, class: 'offscreen',
      'aria-hidden': 'true', tabindex: '-1' });
    document.body.appendChild(tmp);
    Dom.copyText(tmp).then(function (ok) {
      document.body.removeChild(tmp);
      if (ok) {
        state.message = { kind: 'ok', text: 'Link copied for “' + p.title + '”.' };
        state.focusKey = 'new-poll';
        render();
      } else {
        openShare({ mode: 'link', pollId: p.pollId, title: p.title });
      }
    });
  }

  function confirmDelete(p) {
    Dom.confirmDialog({
      title: 'Delete “' + p.title + '”?',
      lines: ['This removes the poll and all of its responses. Its link will stop working.'],
      okLabel: 'Delete poll',
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      call('apiDeletePoll', p.pollId).then(function () {
        state.message = { kind: 'ok', text: 'Deleted “' + p.title + '”.' };
        state.focusKey = 'new-poll';
        loadPolls();
      }, function (err) {
        if (handleSpecial(err)) return;
        state.message = { kind: 'error', text: failureText(err) };
        render();
      });
    });
  }

  // ---- Wizard ----------------------------------------------------------------

  function startNew() {
    state.draft = { pollId: null, title: '', weekStart: '', lengthMin: 60, blocks: [], invitees: [] };
    openWizard(1);
  }

  function startEdit(pollId) {
    state.view = 'loading';
    state.message = null;
    render();
    call('apiGetPoll', pollId).then(function (bundle) {
      state.draft = L.draftFromBundle(bundle);
      openWizard(4);
    }, function (err) {
      if (handleSpecial(err)) return;
      state.message = { kind: 'error', text: failureText(err) };
      loadPolls();
    });
  }

  function openWizard(maxStep) {
    state.step = 1;
    state.maxStep = maxStep;
    state.stepMessage = '';
    state.renaming = null;
    state.message = null;
    state.saving = false;
    state.checking = false;
    state.dirty = false;
    state.dayFilter = 0;
    state.view = 'wizard';
    render();
  }

  function stepErrors(step) {
    var d = state.draft, errs = [];
    if (step === 1) {
      var title = L.normalizeName(d.title);
      if (!title) errs.push('Add a title.');
      else if (title.length > L.TITLE_MAX) errs.push('The title must be ' + L.TITLE_MAX + ' characters or fewer.');
      if (!L.isMonday(d.weekStart)) errs.push('Pick a week.');
    }
    if (step === 2 && d.blocks.length === 0) errs.push('Add at least one time.');
    if (step === 3 && d.invitees.length === 0) errs.push('Add at least one invitee.');
    return errs;
  }

  function goStep(n) {
    for (var s = state.step; s < n; s++) {
      var errs = stepErrors(s);
      if (errs.length) {
        state.stepMessage = errs.join(' ');
        render();
        return;
      }
    }
    state.step = n;
    state.maxStep = Math.max(state.maxStep, n);
    state.stepMessage = '';
    state.renaming = null;
    render();
    window.scrollTo(0, 0);
  }

  function cancelWizard() {
    if (!state.dirty) {
      goHome();
      return;
    }
    Dom.confirmDialog({ title: 'Discard your changes?', lines: ['Nothing has been saved yet.'], okLabel: 'Discard', danger: true })
      .then(function (yes) { if (yes) goHome(); });
  }

  function renderWizard() {
    var bodies = [renderDetails, renderTimes, renderInvitees, renderReview];
    var steps = h('ol', { class: 'steps' }, STEPS.map(function (label, i) {
      var n = i + 1;
      var cls = 'step' + (n === state.step ? ' current' : n <= state.maxStep ? ' done' : '');
      return h('li', { class: cls }, h('button', {
        type: 'button',
        'data-key': 'step-' + n,
        disabled: n > state.maxStep || state.saving || state.checking, // no navigating away mid-save
        'aria-current': n === state.step ? 'step' : null,
        onclick: function () { if (n !== state.step) goStep(n); }
      }, n + '. ' + label));
    }));
    return h('section', null, [
      h('h1', null, state.draft.pollId ? 'Edit poll' : 'New poll'),
      steps,
      messageEl(),
      bodies[state.step - 1]()
    ]);
  }

  // Step 1: details

  function renderDetails() {
    var d = state.draft;
    var weekInfo = h('p', { class: 'note' });
    function showWeek() {
      Dom.clear(weekInfo);
      if (!L.isMonday(d.weekStart)) return;
      weekInfo.appendChild(document.createTextNode('Week of ' + L.formatWeekRange(d.weekStart)));
      if (L.isPastWeek(d.weekStart, L.todayIso(new Date()))) {
        weekInfo.appendChild(h('strong', { class: 'warn' }, ' — this week is in the past.'));
      }
    }
    showWeek();
    return h('div', null, [
      h('div', { class: 'field' }, [
        h('label', { for: 'f-title' }, 'Title'),
        h('input', {
          type: 'text', id: 'f-title', value: d.title, maxlength: String(L.TITLE_MAX),
          placeholder: 'e.g., P&T Committee: Fall review',
          oninput: function (e) { d.title = e.target.value; changed(); }
        })
      ]),
      h('div', { class: 'field' }, [
        h('label', { for: 'f-week' }, 'Week'),
        h('p', { class: 'note' }, 'Pick any day. The poll uses that Monday–Friday.'),
        h('input', {
          type: 'date', id: 'f-week', value: d.weekStart,
          onchange: function (e) {
            if (!e.target.value) {
              d.weekStart = '';
              changed();
              showWeek();
              return;
            }
            var monday = L.weekStartFor(e.target.value);
            if (!monday) return;
            d.weekStart = monday;
            e.target.value = monday;
            changed();
            showWeek();
          }
        }),
        weekInfo
      ]),
      h('fieldset', { class: 'field' }, [
        h('legend', null, 'Meeting length'),
        h('div', { class: 'radio-row' }, L.LENGTHS.map(function (len) {
          return h('label', null, [
            h('input', {
              type: 'radio', name: 'f-length', value: String(len), checked: d.lengthMin === len,
              'data-key': 'len-' + len, onchange: function () { changeLength(len); }
            }),
            ' ' + len + ' minutes'
          ]);
        }))
      ]),
      wizardFooter([
        btn('← Back to my polls', cancelWizard, null, { 'data-key': 'back' }),
        btn('Next: Times →', function () { goStep(2); }, 'primary', { 'data-key': 'next' })
      ])
    ]);
  }

  function changeLength(len) {
    var d = state.draft;
    if (len === d.lengthMin) return;
    var result = L.resizeBlocks(d.blocks, len);
    if (result.removed.length === 0) {
      d.lengthMin = len;
      d.blocks = result.kept;
      changed();
      state.focusKey = 'len-' + len;
      render();
      return;
    }
    Dom.confirmDialog({
      title: 'Some times no longer fit',
      lines: ['With ' + len + '-minute meetings, these times would overlap another time or end after 6:00 PM. They will be removed:']
        .concat(result.removed.map(function (b) { return '• ' + L.blockLabel(b, len); })),
      okLabel: 'Change length'
    }).then(function (yes) {
      if (yes) {
        d.lengthMin = len;
        d.blocks = result.kept;
        changed();
      }
      state.focusKey = 'len-' + d.lengthMin;
      render();
    });
  }

  // Step 2: times

  function renderTimes() {
    var d = state.draft;
    var count = d.blocks.length;
    return h('div', null, [
      h('p', null, 'Click a start time to add a ' + d.lengthMin + '-minute block. Click a block to remove it.'),
      h('p', { class: 'note' }, weekLine(d.weekStart)),
      dayTabsIfNarrow(d.weekStart),
      Grid.render({
        mode: 'edit', weekStart: d.weekStart, lengthMin: d.lengthMin, blocks: d.blocks,
        dayFilter: currentDayFilter(), onCellClick: addBlock, onBlockClick: removeBlock
      }),
      h('p', { class: 'counter' }, count === 1 ? '1 time proposed' : count + ' times proposed'),
      wizardFooter([
        btn('← Back', function () { goStep(1); }, null, { 'data-key': 'back' }),
        btn('Tentative schedule complete →', function () { goStep(3); }, 'primary', { disabled: count === 0, 'data-key': 'next' })
      ])
    ]);
  }

  function addBlock(day, startMin) {
    var d = state.draft;
    var check = L.checkPlacement(d.blocks, day, startMin, d.lengthMin);
    state.focusKey = 'c-' + day + '-' + startMin;
    if (!check.ok) {
      state.stepMessage = L.placementMessage(check, d.lengthMin);
      render();
      return;
    }
    d.blocks = L.sortBlocks(d.blocks.concat([{ blockId: null, day: day, startMin: startMin }]));
    state.stepMessage = '';
    changed();
    render();
  }

  function removeBlock(block) {
    var d = state.draft;
    d.blocks = d.blocks.filter(function (b) { return !(b.day === block.day && b.startMin === block.startMin); });
    state.focusKey = 'c-' + block.day + '-' + block.startMin;
    state.stepMessage = '';
    changed();
    render();
  }

  // Step 3: invitees

  function renderInvitees() {
    var d = state.draft;
    var paste = h('textarea', { id: 'f-paste', rows: '5', placeholder: 'One name per line', 'data-key': 'paste' });
    var single = h('input', {
      type: 'text', id: 'f-name', maxlength: String(L.NAME_MAX), placeholder: 'Name', 'data-key': 'single',
      onkeydown: function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          addNames(single.value, 'single');
        }
      }
    });
    var list = d.invitees.map(function (p, i) { return state.renaming === i ? renameRow(p, i) : nameRow(p, i); });
    return h('div', null, [
      h('div', { class: 'field' }, [
        h('label', { for: 'f-paste' }, 'Paste a list of names'),
        paste,
        btn('Add names', function () { addNames(paste.value, 'paste'); })
      ]),
      h('div', { class: 'field' }, [
        h('label', { for: 'f-name' }, 'Or add one name'),
        h('div', { class: 'inline-row' }, [single, btn('Add', function () { addNames(single.value, 'single'); })])
      ]),
      h('h2', null, 'Invitees (' + d.invitees.length + ')'),
      list.length ? h('ul', { class: 'name-editor' }, list) : h('p', { class: 'note' }, 'No invitees yet.'),
      h('h2', null, 'Preview'),
      h('p', { class: 'note' }, weekLine(d.weekStart)),
      dayTabsIfNarrow(d.weekStart),
      previewGrid(),
      wizardFooter([
        btn('← Back', function () { goStep(2); }, null, { 'data-key': 'back' }),
        btn('Next: Review →', function () { goStep(4); }, 'primary', { disabled: d.invitees.length === 0, 'data-key': 'next' })
      ])
    ]);
  }

  function nameRow(p, i) {
    return h('li', null, [
      h('span', { class: 'name-text' }, p.name),
      btn('Rename', function () {
        state.renaming = i;
        state.focusKey = 'rename-' + i;
        render();
      }, 'link', { 'aria-label': 'Rename ' + p.name, 'data-key': 'rename-btn-' + i }),
      btn('Remove', function () { removeInvitee(i); }, 'link', { 'aria-label': 'Remove ' + p.name })
    ]);
  }

  function renameRow(p, i) {
    var input = h('input', {
      type: 'text', value: p.name, maxlength: String(L.NAME_MAX), 'data-key': 'rename-' + i,
      'aria-label': 'New name for ' + p.name,
      onkeydown: function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitRename(i, input.value);
        }
        if (e.key === 'Escape') {
          state.renaming = null;
          state.focusKey = 'rename-btn-' + i;
          render();
        }
      }
    });
    return h('li', null, [
      input,
      btn('Save', function () { commitRename(i, input.value); }, 'primary'),
      btn('Cancel', function () { state.renaming = null; state.focusKey = 'rename-btn-' + i; render(); })
    ]);
  }

  function addNames(text, focusKey) {
    var d = state.draft;
    var names = L.parseNameList(text);
    if (!names.length) {
      state.stepMessage = 'Type or paste at least one name.';
      state.focusKey = focusKey;
      render();
      return;
    }
    var taken = Object.create(null);
    d.invitees.forEach(function (p) { taken[L.nameKey(p.name)] = true; });
    var added = [], skipped = [], tooLong = [];
    names.forEach(function (n) {
      if (n.length > L.NAME_MAX) { tooLong.push(n); return; }
      if (taken[L.nameKey(n)]) { skipped.push(n); return; }
      taken[L.nameKey(n)] = true;
      added.push({ inviteeId: null, name: n });
    });
    d.invitees = d.invitees.concat(added);
    var notes = [];
    if (skipped.length) notes.push('Already on the list: ' + skipped.join(', ') + '.');
    if (tooLong.length) notes.push('Names must be ' + L.NAME_MAX + ' characters or fewer: ' + tooLong.join(', ') + '.');
    state.stepMessage = notes.join(' ');
    if (added.length) changed();
    state.focusKey = focusKey;
    render();
  }

  function commitRename(i, value) {
    var d = state.draft;
    var name = L.normalizeName(value);
    var clash = d.invitees.some(function (p, j) { return j !== i && L.nameKey(p.name) === L.nameKey(name); });
    if (!name) state.stepMessage = 'Names cannot be blank.';
    else if (name.length > L.NAME_MAX) state.stepMessage = 'Names must be ' + L.NAME_MAX + ' characters or fewer.';
    else if (clash) state.stepMessage = '“' + name + '” is already on the list.';
    else {
      d.invitees[i] = { inviteeId: d.invitees[i].inviteeId, name: name };
      state.renaming = null;
      state.stepMessage = '';
      changed();
    }
    state.focusKey = state.renaming === null ? 'rename-btn-' + i : 'rename-' + i;
    render();
  }

  function removeInvitee(i) {
    state.draft.invitees.splice(i, 1);
    state.renaming = null;
    state.stepMessage = '';
    state.focusKey = 'single';
    changed();
    render();
  }

  function previewGrid() {
    var d = state.draft;
    return Grid.render({
      mode: 'names', weekStart: d.weekStart, lengthMin: d.lengthMin, blocks: d.blocks, dayFilter: currentDayFilter(),
      invitees: d.invitees, ticks: {}, counts: {}, best: [], activeInviteeId: null, showCounts: false
    });
  }

  // Step 4: review

  function renderReview() {
    var d = state.draft;
    var errors = L.validateDraft(d);
    var rows = [
      ['Title', L.normalizeName(d.title), 1],
      ['Week', L.formatWeekRange(d.weekStart), 1],
      ['Meeting length', d.lengthMin + ' minutes', 1],
      ['Proposed times', String(d.blocks.length), 2],
      ['Invitees', d.invitees.map(function (p) { return p.name; }).join(', '), 3]
    ];
    var busy = state.saving || state.checking; // locks navigation while the save is in flight
    var label = state.saving ? 'Saving…' : state.checking ? 'Checking…' : d.pollId ? 'Save changes' : 'Confirm & create link';
    return h('div', null, [
      h('dl', { class: 'summary' }, rows.map(function (r) {
        return [
          h('dt', null, r[0]),
          h('dd', null, [r[1] + ' ', btn('Edit', function () { goStep(r[2]); }, 'link', { disabled: busy, 'aria-label': 'Edit ' + r[0].toLowerCase() })])
        ];
      })),
      errors.length ? h('div', { class: 'msg msg-error', role: 'alert' }, errors.join(' ')) : null,
      h('h2', null, 'What invitees will see'),
      h('p', { class: 'note' }, weekLine(d.weekStart)),
      dayTabsIfNarrow(d.weekStart),
      previewGrid(),
      wizardFooter([
        btn('← Back', function () { goStep(3); }, null, { disabled: busy, 'data-key': 'back' }),
        btn(label, confirmSave, 'primary', { disabled: errors.length > 0 || busy, 'data-key': 'next' })
      ])
    ]);
  }

  function toServerDraft(d) {
    return {
      pollId: d.pollId,
      title: d.title,
      weekStart: d.weekStart,
      lengthMin: d.lengthMin,
      blocks: d.blocks.map(function (b) { return { blockId: b.blockId, day: b.day, startMin: b.startMin }; }),
      invitees: d.invitees.map(function (p) { return { inviteeId: p.inviteeId, name: p.name }; })
    };
  }

  function saveFailed(err) {
    state.saving = false;
    state.checking = false;
    if (handleSpecial(err)) return;
    state.stepMessage = err.code === 'network'
      ? 'Couldn’t save. Check your connection and try again.'
      : failureText(err);
    state.focusKey = 'next';
    render();
  }

  function confirmSave() {
    if (state.checking || state.saving) return;
    var d = state.draft;
    // The wizard may have moved on (or been replaced) while a request was in flight; then the result is ignored.
    function gone() { return state.view !== 'wizard' || state.step !== 4 || state.draft !== d; }
    function failed(err) {
      if (gone()) {
        state.saving = false;
        state.checking = false;
        return;
      }
      saveFailed(err);
    }
    var impact = Promise.resolve([]);
    if (d.pollId) {
      // Count the answers an edit would delete against the poll as it is now, not as it was when the
      // editor was opened: invitees may have answered in the meantime.
      state.checking = true;
      render();
      impact = call('apiGetPoll', d.pollId).then(function (fresh) { return L.describeImpact(L.editImpact(fresh, d)); });
    }
    impact.then(function (lines) {
      return lines.length
        ? Dom.confirmDialog({ title: 'Some answers will be deleted', lines: lines, okLabel: 'Save anyway', danger: true })
        : true;
    }).then(function (yes) {
      state.checking = false;
      if (gone()) {
        state.saving = false;
        return;
      }
      if (!yes) {
        state.focusKey = 'next';
        render();
        return;
      }
      state.saving = true;
      state.stepMessage = '';
      render();
      call('apiSavePoll', toServerDraft(d)).then(function (res) {
        state.saving = false;
        if (gone()) return;
        state.dirty = false;
        openShare({ mode: d.pollId ? 'edited' : 'created', pollId: res.pollId, title: L.normalizeName(d.title) });
      }, failed);
    }, failed);
  }

  // ---- Share -----------------------------------------------------------------

  function openShare(share) {
    state.share = share;
    state.draft = null;
    state.view = 'share';
    render();
  }

  function renderShare() {
    var s = state.share;
    var input = h('input', {
      type: 'text', id: 'share-link', readonly: true, value: linkFor(s.pollId), 'aria-label': 'Poll link',
      onfocus: function (e) { e.target.select(); }
    });
    var status = h('p', { class: 'note', role: 'status' });
    var heading = s.mode === 'created' ? 'Your poll is ready'
      : s.mode === 'edited' ? 'Changes saved' : 'Link for “' + s.title + '”';
    var intro = s.mode === 'edited'
      ? 'The link for “' + s.title + '” has not changed.'
      : 'Send this link to your invitees. Anyone with the link can mark their availability.';
    return h('section', null, [
      h('h1', null, heading),
      h('p', null, intro),
      h('div', { class: 'link-row' }, [input, btn('Copy', function () {
        Dom.copyText(input).then(function (ok) {
          status.textContent = ok ? 'Link copied.' : 'Select the link and press ⌘C (Mac) or Ctrl+C (Windows) to copy it.';
        });
      }, 'primary')]),
      status,
      h('div', { class: 'toolbar' }, [
        btn('← My polls', goHome),
        btn('View results', function () { openResults(s.pollId); })
      ])
    ]);
  }

  // ---- Results ---------------------------------------------------------------

  function openResults(pollId) {
    state.view = 'loading';
    state.message = null;
    render();
    call('apiGetPoll', pollId).then(function (bundle) {
      // Keep the chosen day when the same poll is reloaded (Refresh); start at Monday for another poll.
      var samePoll = state.results && state.results.poll && state.results.poll.pollId === pollId;
      state.results = bundle;
      if (!samePoll) state.dayFilter = 0;
      state.view = 'results';
      render();
    }, function (err) {
      if (handleSpecial(err)) return;
      state.message = { kind: 'error', text: failureText(err) };
      loadPolls();
    });
  }

  function renderResults() {
    var b = state.results, poll = b.poll;
    var t = L.tally(b.blocks, b.invitees, b.responses);
    var total = b.invitees.length;
    var pending = b.invitees.filter(function (p) { return !p.respondedAt; });
    var bestLabels = b.blocks
      .filter(function (x) { return t.best.indexOf(x.blockId) !== -1; })
      .map(function (x) { return L.blockLabel(x, poll.lengthMin); });
    return h('section', null, [
      h('h1', null, poll.title),
      h('p', { class: 'note' }, 'Week of ' + L.formatWeekRange(poll.weekStart) + ' · ' + poll.lengthMin +
        '-minute meeting · All times Eastern (Bloomington)'),
      h('p', null, (total - pending.length) + ' of ' + total + ' responded.'),
      bestLabels.length
        ? h('p', null, [h('strong', null, 'Most available: '), bestLabels.join('; ') + ' (' + t.max + ' of ' + total + ')'])
        : h('p', { class: 'note' }, 'No one has ticked a time yet.'),
      dayTabsIfNarrow(poll.weekStart),
      Grid.render({
        mode: 'names', weekStart: poll.weekStart, lengthMin: poll.lengthMin, blocks: b.blocks,
        dayFilter: currentDayFilter(), invitees: b.invitees, ticks: t.ticks, counts: t.counts, best: t.best,
        activeInviteeId: null, showCounts: true
      }),
      h('h2', null, 'Not yet responded'),
      pending.length
        ? h('ul', { class: 'plain-list' }, pending.map(function (p) { return h('li', null, p.name); }))
        : h('p', null, 'Everyone has responded.'),
      h('div', { class: 'toolbar' }, [
        btn('← My polls', goHome),
        h('div', { class: 'actions' }, [
          btn('Refresh', function () { openResults(poll.pollId); }),
          btn('Edit poll', function () { startEdit(poll.pollId); }),
          btn('Copy link', function () { openShare({ mode: 'link', pollId: poll.pollId, title: poll.title }); })
        ])
      ])
    ]);
  }

  // ---- Data sheet recovery ---------------------------------------------------

  function renderSheetMissing() {
    return h('section', null, [
      h('h1', null, 'The data sheet is missing'),
      h('p', null, 'The Google Sheet that stores your polls can’t be opened right now. This can be a temporary ' +
        'Google problem, so try again first. If the sheet was deleted, you can start a new, empty one.'),
      messageEl(),
      h('div', { class: 'actions' }, [
        btn('Try again', goHome, 'primary', { 'data-key': 'retry' }),
        btn(state.creatingSheet ? 'Creating…' : 'Create a new data sheet', confirmCreateSheet, 'secondary',
          { 'data-key': 'create-sheet', disabled: state.creatingSheet })
      ])
    ]);
  }

  // Replacing the data sheet hides every existing poll, so it needs an explicit yes.
  function confirmCreateSheet() {
    if (state.creatingSheet) return;
    Dom.confirmDialog({
      title: 'Start a new, empty data sheet?',
      lines: ['Your existing polls will no longer appear here, and their links will stop working. ' +
        'Only do this if the data sheet was deleted.'],
      okLabel: 'Create new sheet',
      danger: true
    }).then(function (yes) {
      if (!yes || state.creatingSheet) return;
      state.creatingSheet = true;
      state.message = null;
      render();
      call('apiCreateDataSheet').then(function () {
        state.creatingSheet = false;
        state.message = { kind: 'ok', text: 'Created a new data sheet.' };
        state.view = 'loading';
        render();
        loadPolls();
      }, function (err) {
        state.creatingSheet = false;
        if (handleSpecial(err)) return;
        state.message = { kind: 'error', text: failureText(err) };
        state.focusKey = 'create-sheet';
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
    if (state.view === 'wizard' || state.view === 'results') render();
  });
  goHome();
})();
