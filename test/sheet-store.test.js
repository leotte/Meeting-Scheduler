const test = require('node:test');
const assert = require('node:assert/strict');
const SheetStore = require('../src/server/sheet_store.js');

const C = SheetStore._codec;

test('tabs and columns match the data model', () => {
  assert.deepEqual(C.TABS.map((t) => [t.name, t.key, t.cols]), [
    ['Polls', 'polls', ['pollId', 'title', 'weekStart', 'lengthMin', 'version', 'createdAt', 'updatedAt']],
    ['Blocks', 'blocks', ['pollId', 'blockId', 'day', 'startMin']],
    ['Invitees', 'invitees', ['pollId', 'inviteeId', 'name', 'order', 'respondedAt']],
    ['Responses', 'responses', ['pollId', 'inviteeId', 'blockId']]
  ]);
});

test('numbers are stored as text and read back as numbers', () => {
  assert.equal(C.encodeCell('startMin', 540), '540');
  assert.equal(C.decodeCell('startMin', '540'), 540);
  assert.equal(C.decodeCell('version', 3), 3);
});

test('text a spreadsheet would treat as a formula is escaped and restored', () => {
  for (const s of ['=SUM(A1)', '+1', '-2', '@me']) {
    const encoded = C.encodeCell('name', s);
    assert.equal(encoded, "'" + s);
    assert.equal(C.decodeCell('name', encoded), s);
    assert.equal(C.decodeCell('name', s), s);
  }
});

test('ordinary text and apostrophes are untouched', () => {
  assert.equal(C.encodeCell('name', "O'Brien"), "O'Brien");
  assert.equal(C.decodeCell('name', "'Ana"), "'Ana");
  assert.equal(C.encodeCell('respondedAt', ''), '');
  assert.equal(C.encodeCell('respondedAt', null), '');
});

test('rows round-trip for every tab', () => {
  const samples = {
    polls: { pollId: 'abcdEFGH', title: '=Budget', weekStart: '2026-10-19', lengthMin: 60, version: 3,
      createdAt: '2026-10-09T12:00:00.000Z', updatedAt: '2026-10-09T12:05:00.000Z' },
    blocks: { pollId: 'abcdEFGH', blockId: 'blk00001', day: 4, startMin: 1050 },
    invitees: { pollId: 'abcdEFGH', inviteeId: 'inv00001', name: 'Ana G\u00f3mez', order: 2, respondedAt: '' },
    responses: { pollId: 'abcdEFGH', inviteeId: 'inv00001', blockId: 'blk00001' }
  };
  C.TABS.forEach((tab) => {
    const row = C.objectToRow(tab.cols, samples[tab.key]);
    assert.ok(row.every((v) => typeof v === 'string'), tab.name);
    assert.deepEqual(C.rowToObject(tab.cols, row), samples[tab.key]);
  });
});
