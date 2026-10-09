/*
 * Local preview only (never deployed). Stands in for google.script.run using
 * the real Service and a localStorage-backed table store.
 * Console helpers: PreviewShim.failNextCall(), PreviewShim.simulateMissingSheet(), PreviewShim.reset().
 */
(function () {
  var KEY = 'ms-preview-db';
  var DELAY_MS = 150;
  var mode = { failNext: false, sheetMissing: false };

  function emptyTables() {
    return { polls: [], blocks: [], invitees: [], responses: [] };
  }

  var store = {
    read: function () {
      try {
        var raw = window.localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) { /* start empty */ }
      return emptyTables();
    },
    write: function (tables) {
      window.localStorage.setItem(KEY, JSON.stringify(tables));
    }
  };

  function newId() {
    var bytes = new Uint8Array(8);
    window.crypto.getRandomValues(bytes);
    return Logic.idFromBytes(Array.prototype.slice.call(bytes));
  }

  function service() {
    if (mode.sheetMissing) throw new Service.ServiceError('sheet_missing', 'The data sheet is missing.');
    return Service.create(store, { newId: newId, now: function () { return new Date().toISOString(); } });
  }

  var handlers = {
    apiListPolls: function () { return service().listPolls(); },
    apiGetPoll: function (key, pollId) { return service().getPoll(pollId); },
    apiSavePoll: function (key, draft) { return service().savePoll(draft); },
    apiDeletePoll: function (key, pollId) { return service().deletePoll(pollId); },
    apiCreateDataSheet: function () {
      mode.sheetMissing = false;
      store.write(emptyTables());
      return { created: true };
    },
    apiGetPublicPoll: function (pollId) { return service().getPublicPoll(pollId); },
    apiSaveResponse: function (pollId, inviteeId, blockIds, version) {
      return service().saveResponse(pollId, inviteeId, blockIds, version);
    }
  };

  function runner(onSuccess, onFailure) {
    var r = {
      withSuccessHandler: function (fn) { return runner(fn, onFailure); },
      withFailureHandler: function (fn) { return runner(onSuccess, fn); }
    };
    Object.keys(handlers).forEach(function (name) {
      r[name] = function () {
        var args = JSON.parse(JSON.stringify(Array.prototype.slice.call(arguments)));
        setTimeout(function () {
          if (mode.failNext) {
            mode.failNext = false;
            if (onFailure) onFailure(new Error('Simulated network failure'));
            return;
          }
          var result = Service.envelope(function () { return handlers[name].apply(null, args); });
          if (onSuccess) onSuccess(JSON.parse(JSON.stringify(result)));
        }, DELAY_MS);
      };
    });
    return r;
  }

  window.google = { script: { run: runner(null, null) } };

  window.PreviewShim = {
    boot: function (page) {
      var params = new URLSearchParams(window.location.search);
      if (page === 'invitee') return { pollId: params.get('poll') || '' };
      if (page === 'message') return { title: 'Organizer only', message: 'This page is for the organizer only.' };
      return { baseUrl: window.location.origin + window.location.pathname.replace(/[^/]*$/, 'invitee.html'), adminKey: '' };
    },
    failNextCall: function () { mode.failNext = true; },
    simulateMissingSheet: function () { mode.sheetMissing = true; },
    reset: function () { window.localStorage.removeItem(KEY); }
  };
})();
