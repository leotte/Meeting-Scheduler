const test = require('node:test');
const assert = require('node:assert/strict');
const Logic = require('../src/shared/logic.js');
const Service = require('../src/shared/service.js');
const { createMemoryStore, fakeDeps, sampleDraft } = require('./helpers.js');

const ANA = 'id000004', RAJ = 'id000005', LEE = 'id000006';
const MON = 'id000002', TUE = 'id000003';

function setup() {
  const store = createMemoryStore();
  const service = Service.create(store, fakeDeps());
  return { store, service };
}

function withCode(code) {
  return (err) => err && err.isServiceError === true && err.code === code;
}

function sharedPollWithAnswers() {
  const { store, service } = setup();
  const { pollId } = service.savePoll(sampleDraft());
  service.saveResponse(pollId, ANA, [MON, TUE], 1);
  service.saveResponse(pollId, RAJ, [TUE], 1);
  const draft = Logic.draftFromBundle(service.getPoll(pollId));
  return { store, service, pollId, draft };
}

test('savePoll creates a poll with ids, sorted blocks and ordered invitees', () => {
  const { store, service } = setup();
  assert.deepEqual(service.savePoll(sampleDraft({ title: '  P&T   Committee ' })), { pollId: 'id000001', version: 1 });
  const t = store.peek();
  assert.deepEqual(t.polls, [{
    pollId: 'id000001', title: 'P&T Committee', weekStart: '2026-10-19', lengthMin: 60, version: 1,
    createdAt: '2026-10-09T12:00:01.000Z', updatedAt: '2026-10-09T12:00:01.000Z'
  }]);
  assert.deepEqual(t.blocks, [
    { pollId: 'id000001', blockId: MON, day: 0, startMin: 540 },
    { pollId: 'id000001', blockId: TUE, day: 1, startMin: 540 }
  ]);
  assert.deepEqual(t.invitees, [
    { pollId: 'id000001', inviteeId: ANA, name: 'Ana', order: 0, respondedAt: '' },
    { pollId: 'id000001', inviteeId: RAJ, name: 'Raj', order: 1, respondedAt: '' },
    { pollId: 'id000001', inviteeId: LEE, name: 'Lee', order: 2, respondedAt: '' }
  ]);
  assert.deepEqual(t.responses, []);
});

test('savePoll rejects an invalid draft without writing', () => {
  const { store, service } = setup();
  assert.throws(() => service.savePoll(sampleDraft({ title: '', blocks: [] })),
    (err) => withCode('invalid')(err) && err.message === 'Add a title. Add at least one time.');
  assert.deepEqual(store.peek().polls, []);
});

test('listPolls reports counts, newest first', () => {
  const { service } = setup();
  const first = service.savePoll(sampleDraft({ title: 'First' }));
  service.savePoll(sampleDraft({ title: 'Second' }));
  service.saveResponse(first.pollId, ANA, [MON], 1);
  assert.deepEqual(service.listPolls().map((p) => [p.title, p.invitedCount, p.respondedCount]),
    [['Second', 3, 0], ['First', 3, 1]]);
});

test('getPublicPoll returns only what invitees need', () => {
  const { service } = setup();
  const { pollId } = service.savePoll(sampleDraft());
  service.saveResponse(pollId, RAJ, [TUE], 1);
  assert.deepEqual(service.getPublicPoll(pollId), {
    pollId, title: 'P&T Committee', weekStart: '2026-10-19', lengthMin: 60, version: 1,
    blocks: [{ blockId: MON, day: 0, startMin: 540 }, { blockId: TUE, day: 1, startMin: 540 }],
    invitees: [
      { inviteeId: ANA, name: 'Ana', responded: false },
      { inviteeId: RAJ, name: 'Raj', responded: true },
      { inviteeId: LEE, name: 'Lee', responded: false }
    ],
    responses: [{ inviteeId: RAJ, blockId: TUE }]
  });
});

test('unknown or malformed poll ids are not_found', () => {
  const { service } = setup();
  assert.throws(() => service.getPublicPoll('zzzzzzzz'), withCode('not_found'));
  assert.throws(() => service.getPublicPoll('../etc'), withCode('not_found'));
  assert.throws(() => service.getPoll(''), withCode('not_found'));
  assert.throws(() => service.deletePoll(undefined), withCode('not_found'));
});

test('saveResponse replaces the invitee’s ticks, removes repeats and marks them responded', () => {
  const { store, service } = setup();
  const { pollId } = service.savePoll(sampleDraft());
  service.saveResponse(pollId, ANA, [MON, TUE, MON], 1);
  assert.equal(store.peek().responses.length, 2);
  assert.deepEqual(service.saveResponse(pollId, ANA, [TUE], 1), { savedAt: '2026-10-09T12:00:03.000Z' });
  const t = store.peek();
  assert.deepEqual(t.responses, [{ pollId, inviteeId: ANA, blockId: TUE }]);
  assert.equal(t.invitees.find((p) => p.inviteeId === ANA).respondedAt, '2026-10-09T12:00:03.000Z');
});

test('saving no ticks still counts as responded', () => {
  const { store, service } = setup();
  const { pollId } = service.savePoll(sampleDraft());
  service.saveResponse(pollId, LEE, [], 1);
  const t = store.peek();
  assert.deepEqual(t.responses, []);
  assert.ok(t.invitees.find((p) => p.inviteeId === LEE).respondedAt);
});

test('saveResponse rejects stale versions, unknown invitees, unknown blocks and bad input', () => {
  const { service } = setup();
  const { pollId } = service.savePoll(sampleDraft());
  assert.throws(() => service.saveResponse(pollId, ANA, [], 2), withCode('stale'));
  assert.throws(() => service.saveResponse(pollId, 'id999999', [], 1), withCode('stale'));
  assert.throws(() => service.saveResponse(pollId, ANA, ['id999999'], 1), withCode('stale'));
  assert.throws(() => service.saveResponse(pollId, ANA, ['toString'], 1), withCode('stale'));
  assert.throws(() => service.saveResponse('id999999', ANA, [], 1), withCode('not_found'));
  assert.throws(() => service.saveResponse(pollId, ANA, MON, 1), withCode('invalid'));
});

test('editing: adding a block and an invitee keeps answers and the version', () => {
  const { store, service, pollId, draft } = sharedPollWithAnswers();
  draft.blocks.push({ blockId: null, day: 2, startMin: 600 });
  draft.invitees.push({ inviteeId: null, name: 'Kim' });
  assert.deepEqual(service.savePoll(draft), { pollId, version: 1 });
  const t = store.peek();
  assert.equal(t.responses.length, 3);
  assert.equal(t.blocks.length, 3);
  assert.deepEqual(t.invitees.map((p) => p.name), ['Ana', 'Raj', 'Lee', 'Kim']);
  assert.equal(t.polls[0].createdAt, '2026-10-09T12:00:01.000Z');
});

test('editing: renaming an invitee keeps their answers', () => {
  const { store, service, draft } = sharedPollWithAnswers();
  draft.invitees[0].name = 'Ana Gómez';
  assert.equal(service.savePoll(draft).version, 1);
  const t = store.peek();
  assert.equal(t.invitees[0].name, 'Ana Gómez');
  assert.equal(t.responses.filter((r) => r.inviteeId === ANA).length, 2);
});

test('editing: removing a block deletes its answers and bumps the version', () => {
  const { store, service, pollId, draft } = sharedPollWithAnswers();
  draft.blocks = draft.blocks.filter((b) => b.blockId !== TUE);
  assert.equal(service.savePoll(draft).version, 2);
  const t = store.peek();
  assert.deepEqual(t.responses, [{ pollId, inviteeId: ANA, blockId: MON }]);
  assert.ok(t.invitees.find((p) => p.inviteeId === RAJ).respondedAt);
  assert.equal(service.getPublicPoll(pollId).version, 2);
});

test('editing: removing an invitee deletes their answers', () => {
  const { store, service, pollId, draft } = sharedPollWithAnswers();
  draft.invitees = draft.invitees.filter((p) => p.inviteeId !== ANA);
  assert.equal(service.savePoll(draft).version, 2);
  const t = store.peek();
  assert.deepEqual(t.responses, [{ pollId, inviteeId: RAJ, blockId: TUE }]);
  assert.deepEqual(t.invitees.map((p) => [p.name, p.order]), [['Raj', 0], ['Lee', 1]]);
});

test('editing: changing the length clears every answer but keeps block ids', () => {
  const { store, service, draft } = sharedPollWithAnswers();
  draft.lengthMin = 30;
  assert.equal(service.savePoll(draft).version, 2);
  const t = store.peek();
  assert.deepEqual(t.responses, []);
  assert.ok(t.invitees.every((p) => p.respondedAt === ''));
  assert.deepEqual(t.blocks.map((b) => b.blockId), [MON, TUE]);
});

test('editing: changing the week clears every answer', () => {
  const { store, service, draft } = sharedPollWithAnswers();
  draft.weekStart = '2026-10-26';
  assert.equal(service.savePoll(draft).version, 2);
  const t = store.peek();
  assert.deepEqual(t.responses, []);
  assert.equal(t.polls[0].weekStart, '2026-10-26');
});

test('editing: unknown or repeated ids in a draft are rejected', () => {
  const a = sharedPollWithAnswers();
  a.draft.blocks[0].blockId = 'id999999';
  assert.throws(() => a.service.savePoll(a.draft), withCode('invalid'));

  const b = sharedPollWithAnswers();
  b.draft.invitees[0].inviteeId = 'id999999';
  assert.throws(() => b.service.savePoll(b.draft), withCode('invalid'));

  const c = sharedPollWithAnswers();
  c.draft.invitees.push({ inviteeId: ANA, name: 'Another Ana' });
  assert.throws(() => c.service.savePoll(c.draft), withCode('invalid'));

  const d = sharedPollWithAnswers();
  d.draft.blocks.push({ blockId: MON, day: 3, startMin: 600 });
  assert.throws(() => d.service.savePoll(d.draft), withCode('invalid'));

  const e = sharedPollWithAnswers();
  e.draft.blocks[0].blockId = 'toString';
  assert.throws(() => e.service.savePoll(e.draft), withCode('invalid'));
});

test('editing a poll that no longer exists is not_found', () => {
  const { service, pollId, draft } = sharedPollWithAnswers();
  service.deletePoll(pollId);
  assert.throws(() => service.savePoll(draft), withCode('not_found'));
});

test('deletePoll removes every row for that poll only', () => {
  const { store, service } = setup();
  const a = service.savePoll(sampleDraft({ title: 'A' }));
  const b = service.savePoll(sampleDraft({ title: 'B' }));
  service.saveResponse(a.pollId, ANA, [MON], 1);
  assert.deepEqual(service.deletePoll(a.pollId), { pollId: a.pollId });
  const t = store.peek();
  assert.deepEqual(t.polls.map((p) => p.pollId), [b.pollId]);
  assert.ok(t.blocks.every((r) => r.pollId === b.pollId));
  assert.ok(t.invitees.every((r) => r.pollId === b.pollId));
  assert.deepEqual(t.responses, []);
  assert.throws(() => service.deletePoll(a.pollId), withCode('not_found'));
});

test('envelope wraps results and errors', () => {
  assert.deepEqual(Service.envelope(() => 42), { ok: true, data: 42 });
  assert.deepEqual(Service.envelope(() => { throw new Service.ServiceError('stale', 'Changed'); }),
    { ok: false, code: 'stale', message: 'Changed' });
  assert.deepEqual(Service.envelope(() => { throw new Service.ServiceError('not_found'); }),
    { ok: false, code: 'not_found', message: 'not_found' });
  assert.deepEqual(Service.envelope(() => { throw new Error('boom'); }),
    { ok: false, code: 'server_error', message: 'boom' });
});
