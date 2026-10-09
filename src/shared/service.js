/*
 * Meeting Scheduler — poll operations over a table store. Runs on the Apps
 * Script server, in Node tests and in the local preview.
 *
 * store: { read(): Tables, write(tables) }
 * Tables: { polls: [], blocks: [], invitees: [], responses: [] }
 * deps:  { newId(): 8-character id, now(): ISO timestamp }
 */
var Service = (function () {
  var logicRef = null;

  // Resolved on first use: Apps Script does not guarantee file load order.
  function L() {
    if (!logicRef) logicRef = typeof Logic !== 'undefined' ? Logic : require('./logic.js');
    return logicRef;
  }

  function ServiceError(code, message) {
    this.name = 'ServiceError';
    this.code = code;
    this.message = message || code;
    this.isServiceError = true;
    this.stack = new Error(this.message).stack;
  }
  ServiceError.prototype = Object.create(Error.prototype);
  ServiceError.prototype.constructor = ServiceError;

  function envelope(fn) {
    try {
      return { ok: true, data: fn() };
    } catch (err) {
      if (err && err.isServiceError) return { ok: false, code: err.code, message: err.message };
      return { ok: false, code: 'server_error', message: String((err && err.message) || err) };
    }
  }

  function forPoll(rows, pollId) {
    return rows.filter(function (r) { return r.pollId === pollId; });
  }

  function notForPoll(rows, pollId) {
    return rows.filter(function (r) { return r.pollId !== pollId; });
  }

  // Prototype-free so ids such as "toString" never match inherited properties.
  function indexBy(rows, key) {
    var out = Object.create(null);
    rows.forEach(function (r) { out[r[key]] = r; });
    return out;
  }

  function pick(rows, keys) {
    return rows.map(function (r) {
      var o = {};
      keys.forEach(function (k) { o[k] = r[k]; });
      return o;
    });
  }

  function bundleFrom(tables, pollId) {
    if (!L().isValidId(pollId)) return null;
    var poll = forPoll(tables.polls, pollId)[0];
    if (!poll) return null;
    return {
      poll: poll,
      blocks: L().sortBlocks(forPoll(tables.blocks, pollId)),
      invitees: forPoll(tables.invitees, pollId).sort(function (a, b) { return a.order - b.order; }),
      responses: forPoll(tables.responses, pollId)
    };
  }

  function create(store, deps) {
    function requireBundle(tables, pollId) {
      var bundle = bundleFrom(tables, pollId);
      if (!bundle) throw new ServiceError('not_found', 'This poll is no longer available.');
      return bundle;
    }

    function uniqueId(taken) {
      for (var i = 0; i < 20; i++) {
        var id = deps.newId();
        if (!taken[id]) {
          taken[id] = true;
          return id;
        }
      }
      throw new ServiceError('server_error', 'Could not create a unique id.');
    }

    function stale() {
      return new ServiceError('stale', 'The organizer updated this poll.');
    }

    function rejectRepeat(seen, id, what) {
      if (!id) return;
      if (seen[id]) throw new ServiceError('invalid', 'Repeated ' + what + '.');
      seen[id] = true;
    }

    function listPolls() {
      var t = store.read();
      return t.polls.map(function (p) {
        var invitees = forPoll(t.invitees, p.pollId);
        return {
          pollId: p.pollId,
          title: p.title,
          weekStart: p.weekStart,
          lengthMin: p.lengthMin,
          invitedCount: invitees.length,
          respondedCount: invitees.filter(function (x) { return !!x.respondedAt; }).length,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt
        };
      }).sort(function (a, b) {
        return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
      });
    }

    function getPoll(pollId) {
      return requireBundle(store.read(), pollId);
    }

    function savePoll(draft) {
      draft = draft || {};
      var errors = L().validateDraft(draft);
      if (errors.length) throw new ServiceError('invalid', errors.join(' '));
      var t = store.read();
      var now = deps.now();
      var existing = draft.pollId != null ? requireBundle(t, draft.pollId) : null;
      var impact = existing ? L().editImpact(existing, draft) : null;
      var pollId = existing ? existing.poll.pollId : uniqueId(indexBy(t.polls, 'pollId'));

      var oldBlocks = indexBy(existing ? existing.blocks : [], 'blockId');
      var takenBlockIds = indexBy(existing ? existing.blocks : [], 'blockId');
      var seenBlocks = Object.create(null);
      var blocks = L().sortBlocks(draft.blocks).map(function (b) {
        rejectRepeat(seenBlocks, b.blockId, 'time block');
        if (b.blockId && !oldBlocks[b.blockId]) throw new ServiceError('invalid', 'Unknown time block.');
        if (b.blockId && (oldBlocks[b.blockId].day !== b.day || oldBlocks[b.blockId].startMin !== b.startMin)) {
          // A saved block keeps its answers, so it must not change time; remove it and add a new one instead.
          throw new ServiceError('invalid', 'A saved time cannot be moved.');
        }
        return { pollId: pollId, blockId: b.blockId || uniqueId(takenBlockIds), day: b.day, startMin: b.startMin };
      });

      var oldInvitees = indexBy(existing ? existing.invitees : [], 'inviteeId');
      var takenInviteeIds = indexBy(existing ? existing.invitees : [], 'inviteeId');
      var seenInvitees = Object.create(null);
      var invitees = draft.invitees.map(function (p, i) {
        rejectRepeat(seenInvitees, p.inviteeId, 'invitee');
        if (p.inviteeId && !oldInvitees[p.inviteeId]) throw new ServiceError('invalid', 'Unknown invitee.');
        var prev = p.inviteeId ? oldInvitees[p.inviteeId] : null;
        return {
          pollId: pollId,
          inviteeId: p.inviteeId || uniqueId(takenInviteeIds),
          name: L().normalizeName(p.name),
          order: i,
          respondedAt: prev && !impact.clearsAll ? prev.respondedAt : ''
        };
      });

      var responses = [];
      if (existing && !impact.clearsAll) {
        var keepBlocks = indexBy(blocks, 'blockId');
        var keepInvitees = indexBy(invitees, 'inviteeId');
        responses = existing.responses.filter(function (r) {
          return keepBlocks[r.blockId] && keepInvitees[r.inviteeId];
        });
      }

      var version = existing ? existing.poll.version + (impact.bumpsVersion ? 1 : 0) : 1;
      var poll = {
        pollId: pollId,
        title: L().normalizeName(draft.title),
        weekStart: draft.weekStart,
        lengthMin: draft.lengthMin,
        version: version,
        createdAt: existing ? existing.poll.createdAt : now,
        updatedAt: now
      };
      store.write({
        polls: notForPoll(t.polls, pollId).concat([poll]),
        blocks: notForPoll(t.blocks, pollId).concat(blocks),
        invitees: notForPoll(t.invitees, pollId).concat(invitees),
        responses: notForPoll(t.responses, pollId).concat(responses)
      });
      return { pollId: pollId, version: version };
    }

    function deletePoll(pollId) {
      var t = store.read();
      requireBundle(t, pollId);
      store.write({
        polls: notForPoll(t.polls, pollId),
        blocks: notForPoll(t.blocks, pollId),
        invitees: notForPoll(t.invitees, pollId),
        responses: notForPoll(t.responses, pollId)
      });
      return { pollId: pollId };
    }

    function getPublicPoll(pollId) {
      var b = requireBundle(store.read(), pollId);
      return {
        pollId: b.poll.pollId,
        title: b.poll.title,
        weekStart: b.poll.weekStart,
        lengthMin: b.poll.lengthMin,
        version: b.poll.version,
        blocks: pick(b.blocks, ['blockId', 'day', 'startMin']),
        invitees: b.invitees.map(function (p) {
          return { inviteeId: p.inviteeId, name: p.name, responded: !!p.respondedAt };
        }),
        responses: pick(b.responses, ['inviteeId', 'blockId'])
      };
    }

    function saveResponse(pollId, inviteeId, blockIds, version) {
      if (!Array.isArray(blockIds)) throw new ServiceError('invalid', 'Expected a list of times.');
      var t = store.read();
      var bundle = requireBundle(t, pollId);
      if (version !== bundle.poll.version) throw stale();
      if (!bundle.invitees.some(function (p) { return p.inviteeId === inviteeId; })) throw stale();
      var known = indexBy(bundle.blocks, 'blockId');
      var chosen = [];
      blockIds.forEach(function (id) {
        if (!known[id]) throw stale();
        if (chosen.indexOf(id) === -1) chosen.push(id);
      });
      var now = deps.now();
      function mine(row) { return row.pollId === pollId && row.inviteeId === inviteeId; }
      store.write({
        polls: t.polls,
        blocks: t.blocks,
        invitees: t.invitees.map(function (p) { return mine(p) ? Object.assign({}, p, { respondedAt: now }) : p; }),
        responses: t.responses.filter(function (r) { return !mine(r); }).concat(chosen.map(function (id) {
          return { pollId: pollId, inviteeId: inviteeId, blockId: id };
        }))
      });
      return { savedAt: now };
    }

    return {
      listPolls: listPolls,
      getPoll: getPoll,
      savePoll: savePoll,
      deletePoll: deletePoll,
      getPublicPoll: getPublicPoll,
      saveResponse: saveResponse
    };
  }

  return { create: create, envelope: envelope, ServiceError: ServiceError };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Service;
