const test = require('node:test');
const assert = require('node:assert/strict');
const Logic = require('../src/shared/logic.js');

const MON9 = { blockId: null, day: 0, startMin: 540 };
const TUE9 = { blockId: null, day: 1, startMin: 540 };

function draft(overrides) {
  return Object.assign({
    pollId: null,
    title: 'P&T Committee',
    weekStart: '2026-10-19',
    lengthMin: 60,
    blocks: [MON9, TUE9],
    invitees: [{ inviteeId: null, name: 'Ana' }, { inviteeId: null, name: 'Raj' }]
  }, overrides || {});
}

test('sortBlocks orders by day then start without mutating', () => {
  const input = [{ day: 1, startMin: 600 }, { day: 0, startMin: 900 }, { day: 1, startMin: 540 }];
  assert.deepEqual(Logic.sortBlocks(input), [{ day: 0, startMin: 900 }, { day: 1, startMin: 540 }, { day: 1, startMin: 600 }]);
  assert.equal(input[0].startMin, 600);
});

test('checkPlacement accepts free times that end by 6:00 PM', () => {
  assert.deepEqual(Logic.checkPlacement([], 0, 540, 60), { ok: true });
  assert.deepEqual(Logic.checkPlacement([], 0, 1020, 60), { ok: true });
  assert.deepEqual(Logic.checkPlacement([], 0, 990, 90), { ok: true });
  assert.deepEqual(Logic.checkPlacement([], 4, 1050, 30), { ok: true });
});

test('checkPlacement rejects blocks that run past 6:00 PM', () => {
  assert.deepEqual(Logic.checkPlacement([], 0, 1050, 60), { ok: false, reason: 'past_end' });
  assert.deepEqual(Logic.checkPlacement([], 0, 1020, 90), { ok: false, reason: 'past_end' });
});

test('checkPlacement rejects overlaps on the same day only', () => {
  const blocks = [{ blockId: 'b1', day: 1, startMin: 540 }];
  assert.deepEqual(Logic.checkPlacement(blocks, 1, 570, 60), { ok: false, reason: 'overlap', conflict: blocks[0] });
  assert.deepEqual(Logic.checkPlacement(blocks, 1, 510, 60), { ok: false, reason: 'overlap', conflict: blocks[0] });
  assert.deepEqual(Logic.checkPlacement(blocks, 1, 600, 60), { ok: true });
  assert.deepEqual(Logic.checkPlacement(blocks, 1, 480, 60), { ok: true });
  assert.deepEqual(Logic.checkPlacement(blocks, 0, 540, 60), { ok: true });
});

test('checkPlacement rejects invalid days and starts', () => {
  assert.equal(Logic.checkPlacement([], 5, 540, 60).reason, 'invalid');
  assert.equal(Logic.checkPlacement([], -1, 540, 60).reason, 'invalid');
  assert.equal(Logic.checkPlacement([], 1.5, 540, 60).reason, 'invalid');
  assert.equal(Logic.checkPlacement([], 0, 450, 60).reason, 'invalid');
  assert.equal(Logic.checkPlacement([], 0, 545, 60).reason, 'invalid');
  assert.equal(Logic.checkPlacement([], 0, '540', 60).reason, 'invalid');
  assert.equal(Logic.checkPlacement([], '0', 540, 60).reason, 'invalid');
});

test('placementMessage explains a rejected click', () => {
  assert.equal(Logic.placementMessage({ ok: false, reason: 'past_end' }, 60), 'Would end after 6:00 PM');
  assert.equal(
    Logic.placementMessage({ ok: false, reason: 'overlap', conflict: { day: 1, startMin: 540 } }, 60),
    'Overlaps the 9:00–10:00 AM block');
  assert.equal(Logic.placementMessage({ ok: false, reason: 'invalid' }, 60), 'That time is outside the calendar');
  assert.equal(Logic.placementMessage({ ok: true }, 60), '');
});

test('resizeBlocks keeps start times and drops blocks that no longer fit', () => {
  const blocks = [{ day: 1, startMin: 1020 }, { day: 0, startMin: 600 }, { day: 0, startMin: 540 }];
  assert.deepEqual(Logic.resizeBlocks(blocks, 90), {
    kept: [{ day: 0, startMin: 540 }],
    removed: [{ day: 0, startMin: 600 }, { day: 1, startMin: 1020 }]
  });
  assert.deepEqual(Logic.resizeBlocks(blocks, 30).removed, []);
});

test('blockLabel', () => {
  assert.equal(Logic.blockLabel({ day: 1, startMin: 540 }, 60), 'Tue 9:00–10:00 AM');
  assert.equal(Logic.blockLabel({ day: 4, startMin: 690 }, 60), 'Fri 11:30 AM–12:30 PM');
});

test('name helpers trim, collapse spaces and ignore case', () => {
  assert.equal(Logic.normalizeName('  Ana   María '), 'Ana María');
  assert.equal(Logic.normalizeName(null), '');
  assert.equal(Logic.nameKey('  ANA '), 'ana');
  assert.deepEqual(Logic.parseNameList('Ana\n\n  Raj \r\nLee\n'), ['Ana', 'Raj', 'Lee']);
  assert.deepEqual(Logic.parseNameList(''), []);
  assert.deepEqual(Logic.findDuplicateNames(['Ana', 'Raj', 'ana', 'Lee']), ['ana']);
  assert.deepEqual(Logic.findDuplicateNames(['Ana', 'Raj']), []);
});

test('validateDraft accepts a complete draft', () => {
  assert.deepEqual(Logic.validateDraft(draft()), []);
});

test('validateDraft lists every missing piece', () => {
  const expected = [
    'Add a title.',
    'Pick a week.',
    'Pick a meeting length of 30, 60 or 90 minutes.',
    'Add at least one time.',
    'Add at least one invitee.'
  ];
  assert.deepEqual(Logic.validateDraft({}), expected);
  assert.deepEqual(Logic.validateDraft(null), expected);
});

test('validateDraft checks the week, title length and blocks', () => {
  assert.deepEqual(Logic.validateDraft(draft({ weekStart: '2026-10-20' })), ['Pick a week.']);
  assert.deepEqual(Logic.validateDraft(draft({ title: 'x'.repeat(121) })),
    ['The title must be 120 characters or fewer.']);
  assert.deepEqual(Logic.validateDraft(draft({ blocks: [MON9, { blockId: null, day: 0, startMin: 570 }] })),
    ['Times must not overlap and must end by 6:00 PM.']);
  assert.deepEqual(Logic.validateDraft(draft({ lengthMin: 90, blocks: [{ blockId: null, day: 0, startMin: 1020 }] })),
    ['Times must not overlap and must end by 6:00 PM.']);
});

test('validateDraft checks invitee names', () => {
  assert.deepEqual(Logic.validateDraft(draft({ invitees: [{ name: 'Ana' }, { name: ' ana ' }] })),
    ['Duplicate names: ana.']);
  assert.deepEqual(Logic.validateDraft(draft({ invitees: [{ name: 'Ana' }, { name: '  ' }] })),
    ['Invitee names cannot be blank.']);
  assert.deepEqual(Logic.validateDraft(draft({ invitees: [{ name: 'y'.repeat(61) }] })),
    ['Names must be 60 characters or fewer.']);
});
