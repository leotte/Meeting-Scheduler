const test = require('node:test');
const assert = require('node:assert/strict');
const Logic = require('../src/shared/logic.js');

const DONE = '2026-10-09T12:00:00.000Z';

function existing() {
  return {
    poll: { pollId: 'pollAAAA', title: 'T', weekStart: '2026-10-19', lengthMin: 60, version: 1 },
    blocks: [{ blockId: 'b1', day: 0, startMin: 540 }, { blockId: 'b2', day: 1, startMin: 540 }],
    invitees: [
      { inviteeId: 'i1', name: 'Ana', order: 0, respondedAt: DONE },
      { inviteeId: 'i2', name: 'Raj', order: 1, respondedAt: DONE },
      { inviteeId: 'i3', name: 'Lee', order: 2, respondedAt: '' }
    ],
    responses: [
      { inviteeId: 'i1', blockId: 'b1' },
      { inviteeId: 'i2', blockId: 'b2' },
      { inviteeId: 'i1', blockId: 'b2' }
    ]
  };
}

test('tally counts valid ticks once and finds the best blocks', () => {
  const blocks = [{ blockId: 'b1' }, { blockId: 'b2' }, { blockId: 'b3' }];
  const invitees = [{ inviteeId: 'i1' }, { inviteeId: 'i2' }, { inviteeId: 'i3' }];
  const responses = [
    { inviteeId: 'i1', blockId: 'b1' }, { inviteeId: 'i2', blockId: 'b1' },
    { inviteeId: 'i3', blockId: 'b2' }, { inviteeId: 'i1', blockId: 'b2' },
    { inviteeId: 'ghost', blockId: 'b1' }, { inviteeId: 'i1', blockId: 'bX' },
    { inviteeId: 'i1', blockId: 'b1' },
    { inviteeId: 'i1', blockId: 'toString' }, { inviteeId: 'constructor', blockId: 'b3' }
  ];
  assert.deepEqual(Logic.tally(blocks, invitees, responses), {
    ticks: { b1: ['i1', 'i2'], b2: ['i3', 'i1'], b3: [] },
    counts: { b1: 2, b2: 2, b3: 0 },
    best: ['b1', 'b2'],
    max: 2
  });
});

test('tally has no best block when nobody ticked anything', () => {
  const result = Logic.tally([{ blockId: 'b1' }], [{ inviteeId: 'i1' }], []);
  assert.deepEqual(result.best, []);
  assert.equal(result.max, 0);
});

test('listNames', () => {
  assert.equal(Logic.listNames([]), '');
  assert.equal(Logic.listNames(['Ana']), 'Ana');
  assert.equal(Logic.listNames(['Ana', 'Raj']), 'Ana and Raj');
  assert.equal(Logic.listNames(['Ana', 'Raj', 'Lee']), 'Ana, Raj and Lee');
});

test('draftFromBundle copies the editable fields in display order', () => {
  const bundle = existing();
  bundle.invitees = [bundle.invitees[2], bundle.invitees[0], bundle.invitees[1]];
  assert.deepEqual(Logic.draftFromBundle(bundle), {
    pollId: 'pollAAAA',
    title: 'T',
    weekStart: '2026-10-19',
    lengthMin: 60,
    blocks: [{ blockId: 'b1', day: 0, startMin: 540 }, { blockId: 'b2', day: 1, startMin: 540 }],
    invitees: [{ inviteeId: 'i1', name: 'Ana' }, { inviteeId: 'i2', name: 'Raj' }, { inviteeId: 'i3', name: 'Lee' }]
  });
});

test('editImpact: no change needs nothing', () => {
  const impact = Logic.editImpact(existing(), Logic.draftFromBundle(existing()));
  assert.equal(impact.needsConfirm, false);
  assert.equal(impact.bumpsVersion, false);
  assert.equal(impact.clearsAll, false);
  assert.deepEqual(Logic.describeImpact(impact), []);
});

test('editImpact: additions need nothing', () => {
  const d = Logic.draftFromBundle(existing());
  d.blocks.push({ blockId: null, day: 2, startMin: 600 });
  d.invitees.push({ inviteeId: null, name: 'Kim' });
  const impact = Logic.editImpact(existing(), d);
  assert.equal(impact.needsConfirm, false);
  assert.equal(impact.bumpsVersion, false);
});

test('editImpact: removing a ticked block names who ticked it', () => {
  const d = Logic.draftFromBundle(existing());
  d.blocks = d.blocks.filter((b) => b.blockId !== 'b2');
  const impact = Logic.editImpact(existing(), d);
  assert.deepEqual(impact.removedBlocks, [{ blockId: 'b2', label: 'Tue 9:00–10:00 AM', names: ['Ana', 'Raj'] }]);
  assert.equal(impact.needsConfirm, true);
  assert.equal(impact.bumpsVersion, true);
  assert.deepEqual(Logic.describeImpact(impact),
    ['Ana and Raj ticked Tue 9:00–10:00 AM. Removing this time deletes those answers.']);
});

test('editImpact: removing a block ticked by one person', () => {
  const d = Logic.draftFromBundle(existing());
  d.blocks = d.blocks.filter((b) => b.blockId !== 'b1');
  assert.deepEqual(Logic.describeImpact(Logic.editImpact(existing(), d)),
    ['Ana ticked Mon 9:00–10:00 AM. Removing this time deletes that answer.']);
});

test('editImpact: removing someone who responded needs confirmation', () => {
  const d = Logic.draftFromBundle(existing());
  d.invitees = d.invitees.filter((p) => p.inviteeId !== 'i1');
  const impact = Logic.editImpact(existing(), d);
  assert.deepEqual(impact.removedInvitees, [{ inviteeId: 'i1', name: 'Ana', responded: true }]);
  assert.equal(impact.needsConfirm, true);
  assert.deepEqual(Logic.describeImpact(impact), ['Ana already responded. Removing Ana deletes their answers.']);
});

test('editImpact: removing someone who has not responded only bumps the version', () => {
  const d = Logic.draftFromBundle(existing());
  d.invitees = d.invitees.filter((p) => p.inviteeId !== 'i3');
  const impact = Logic.editImpact(existing(), d);
  assert.equal(impact.needsConfirm, false);
  assert.equal(impact.bumpsVersion, true);
  assert.deepEqual(Logic.describeImpact(impact), []);
});

test('editImpact: changing the length clears every answer', () => {
  const d = Logic.draftFromBundle(existing());
  d.lengthMin = 30;
  const impact = Logic.editImpact(existing(), d);
  assert.equal(impact.clearsAll, true);
  assert.equal(impact.lengthChanged, true);
  assert.deepEqual(impact.responders, ['Ana', 'Raj']);
  assert.equal(impact.needsConfirm, true);
  assert.deepEqual(Logic.describeImpact(impact), [
    'You changed the meeting length. All answers from Ana and Raj will be cleared, and they will need to respond again.'
  ]);
});

test('editImpact: changing the week and the length', () => {
  const d = Logic.draftFromBundle(existing());
  d.lengthMin = 30;
  d.weekStart = '2026-10-26';
  assert.deepEqual(Logic.describeImpact(Logic.editImpact(existing(), d)), [
    'You changed the week and the meeting length. All answers from Ana and Raj will be cleared, and they will need to respond again.'
  ]);
});

test('editImpact: changing the week before anyone responded needs no confirmation', () => {
  const bundle = existing();
  bundle.invitees.forEach((p) => { p.respondedAt = ''; });
  bundle.responses = [];
  const d = Logic.draftFromBundle(bundle);
  d.weekStart = '2026-10-26';
  const impact = Logic.editImpact(bundle, d);
  assert.equal(impact.clearsAll, true);
  assert.equal(impact.weekChanged, true);
  assert.equal(impact.needsConfirm, false);
  assert.equal(impact.bumpsVersion, true);
  assert.deepEqual(Logic.describeImpact(impact), []);
});

test('idFromBytes maps bytes onto 62 characters', () => {
  assert.equal(Logic.idFromBytes([0, 1, 2, 3, 4, 5, 6, 7]), 'ABCDEFGH');
  assert.equal(Logic.idFromBytes([25, 26, 51, 52, 61, 62, 255, 124]), 'Zaz09AHA');
});

test('isValidId', () => {
  assert.equal(Logic.isValidId('ABCDefg9'), true);
  assert.equal(Logic.isValidId('ABC'), false);
  assert.equal(Logic.isValidId('ABCDEFG!'), false);
  assert.equal(Logic.isValidId('ABCDEFGHI'), false);
  assert.equal(Logic.isValidId(12345678), false);
  assert.equal(Logic.isValidId(null), false);
});
