/* Shared test helpers: an in-memory table store, deterministic ids and clock, a sample draft. */
function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

function createMemoryStore(initial) {
  var tables = clone(initial || { polls: [], blocks: [], invitees: [], responses: [] });
  return {
    read: function () { return clone(tables); },
    write: function (next) { tables = clone(next); },
    peek: function () { return clone(tables); }
  };
}

function fakeDeps() {
  var ids = 0, ticks = 0;
  return {
    newId: function () { ids += 1; return 'id' + String(ids).padStart(6, '0'); },
    now: function () { ticks += 1; return '2026-10-09T12:00:' + String(ticks).padStart(2, '0') + '.000Z'; }
  };
}

function sampleDraft(overrides) {
  return Object.assign({
    pollId: null,
    title: 'P&T Committee',
    weekStart: '2026-10-19',
    lengthMin: 60,
    blocks: [{ blockId: null, day: 1, startMin: 540 }, { blockId: null, day: 0, startMin: 540 }],
    invitees: [{ inviteeId: null, name: 'Ana' }, { inviteeId: null, name: 'Raj' }, { inviteeId: null, name: 'Lee' }]
  }, overrides || {});
}

module.exports = { clone, createMemoryStore, fakeDeps, sampleDraft };
