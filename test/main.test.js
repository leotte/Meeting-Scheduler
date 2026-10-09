const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Logic = require('../src/shared/logic.js');
const Service = require('../src/shared/service.js');
const { createMemoryStore, sampleDraft } = require('./helpers.js');

const OWNER = 'lrego@iu.edu';
const DEPLOY_URL = 'https://script.google.com/macros/s/DEPLOY/exec';
const MAIN = fs.readFileSync(path.join(__dirname, '..', 'src', 'server', 'main.js'), 'utf8');

function plain(x) {
  return JSON.parse(JSON.stringify(x));
}

function loadMain(opts) {
  const props = Object.assign({}, opts.props);
  const store = createMemoryStore();
  const lockLog = [];
  const pages = [];
  const errors = [];
  const calls = { createNew: 0 };
  let uuid = 0;
  const sandbox = {
    Logic,
    Service,
    Session: {
      getActiveUser: () => ({ getEmail: () => opts.active }),
      getEffectiveUser: () => ({ getEmail: () => (opts.effective === undefined ? OWNER : opts.effective) })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; }
      })
    },
    LockService: {
      getScriptLock: () => ({ waitLock: () => lockLog.push('wait'), releaseLock: () => lockLog.push('release') })
    },
    SheetStore: {
      open: () => {
        if (opts.sheetMissing) throw new Service.ServiceError('sheet_missing', 'The data sheet is missing.');
        if (opts.openError) throw new Error(opts.openError);
        return store;
      },
      createNew: () => { calls.createNew += 1; return store; }
    },
    Utilities: {
      getUuid: () => {
        uuid += 1;
        return uuid.toString(16).padStart(8, '0') + '-0000-4000-8000-000000000000';
      }
    },
    HtmlService: {
      createTemplateFromFile: (name) => {
        const template = {
          evaluate: () => {
            const page = { name, boot: JSON.parse(template.bootJson), bootJson: template.bootJson, title: null, meta: [] };
            pages.push(page);
            const out = {
              setTitle: (t) => { page.title = t; return out; },
              addMetaTag: (n, c) => { page.meta.push([n, c]); return out; }
            };
            return out;
          }
        };
        return template;
      },
      createHtmlOutputFromFile: (name) => ({ getContent: () => '<!-- ' + name + ' -->' })
    },
    ScriptApp: { getService: () => ({ getUrl: () => DEPLOY_URL }) },
    Logger: { log: () => {} },
    console: { error: (m) => errors.push(String(m)) }
  };
  vm.createContext(sandbox);
  vm.runInContext(MAIN, sandbox);
  return { m: sandbox, props, store, lockLog, pages, calls, errors };
}

test('owner check passes for the owner, ignoring case', () => {
  assert.equal(loadMain({ active: OWNER }).m.isOwner_(''), true);
  assert.equal(loadMain({ active: 'LRego@IU.edu' }).m.isOwner_(''), true);
});

test('owner check fails for other people and anonymous visitors', () => {
  assert.equal(loadMain({ active: 'someone@iu.edu' }).m.isOwner_(''), false);
  assert.equal(loadMain({ active: '' }).m.isOwner_(''), false);
  assert.equal(loadMain({ active: '', effective: '' }).m.isOwner_(''), false);
});

test('owner check accepts the admin key fallback', () => {
  const { m } = loadMain({ active: '', props: { ADMIN_KEY: 'secret123' } });
  assert.equal(m.isOwner_('secret123'), true);
  assert.equal(m.isOwner_('wrong'), false);
  assert.equal(m.isOwner_(''), false);
  assert.equal(m.isOwner_(undefined), false);
  assert.equal(plain(m.apiListPolls('secret123')).ok, true);
  assert.equal(plain(m.apiListPolls('wrong')).code, 'not_owner');
});

test('doGet serves the invitee page for ?poll=', () => {
  const { m, pages } = loadMain({ active: '' });
  m.doGet({ parameter: { poll: 'abcd1234' } });
  assert.equal(pages[0].name, 'invitee');
  assert.deepEqual(plain(pages[0].boot), { pollId: 'abcd1234' });
  assert.equal(pages[0].title, 'Meeting availability');
  assert.deepEqual(plain(pages[0].meta), [['viewport', 'width=device-width, initial-scale=1']]);
});

test('doGet escapes < in boot data', () => {
  const { m, pages } = loadMain({ active: '' });
  m.doGet({ parameter: { poll: '</script><b>' } });
  assert.equal(pages[0].bootJson.indexOf('</script>'), -1);
  assert.ok(pages[0].bootJson.indexOf('\\u003c/script>') !== -1);
  assert.equal(pages[0].boot.pollId, '</script><b>');
});

test('doGet serves the organizer page to the owner', () => {
  const { m, pages } = loadMain({ active: OWNER });
  m.doGet({ parameter: {} });
  assert.equal(pages[0].name, 'organizer');
  assert.deepEqual(plain(pages[0].boot), { baseUrl: DEPLOY_URL, adminKey: '' });
  assert.equal(pages[0].title, 'Meeting Scheduler');
});

test('doGet prefers the BASE_URL property and passes the admin key through', () => {
  const { m, pages } = loadMain({ active: '', props: { ADMIN_KEY: 'k1', BASE_URL: 'https://example.test/exec' } });
  m.doGet({ parameter: { admin: 'k1' } });
  assert.equal(pages[0].name, 'organizer');
  assert.deepEqual(plain(pages[0].boot), { baseUrl: 'https://example.test/exec', adminKey: 'k1' });

  // A pasted address is cleaned: no query, fragment, whitespace or trailing slash.
  [
    ['https://example.test/exec/?x=1', 'https://example.test/exec'],
    ['https://example.test/exec/', 'https://example.test/exec'],
    ['  https://example.test/exec#top\n', 'https://example.test/exec'],
    ['https://example.test/exec//?a=1#b', 'https://example.test/exec'],
    ['?x=1', DEPLOY_URL]
  ].forEach(([raw, expected]) => {
    const loaded = loadMain({ active: '', props: { ADMIN_KEY: 'k1', BASE_URL: raw } });
    loaded.m.doGet({ parameter: { admin: 'k1' } });
    assert.equal(loaded.pages[0].boot.baseUrl, expected, JSON.stringify(raw));
  });
});

test('doGet shows the organizer-only message to everyone else', () => {
  const { m, pages } = loadMain({ active: '' });
  m.doGet(undefined);
  assert.equal(pages[0].name, 'message');
  assert.deepEqual(plain(pages[0].boot), { title: 'Organizer only', message: 'This page is for the organizer only.' });
});

test('include returns the HTML file content', () => {
  assert.equal(loadMain({ active: '' }).m.include('styles'), '<!-- styles -->');
});

test('organizer API refuses non-owners', () => {
  const { m, lockLog } = loadMain({ active: '' });
  const expected = { ok: false, code: 'not_owner', message: 'This page is for the organizer only.' };
  assert.deepEqual(plain(m.apiListPolls('')), expected);
  assert.deepEqual(plain(m.apiSavePoll('', sampleDraft())), expected);
  assert.deepEqual(plain(m.apiDeletePoll('', 'abcd1234')), expected);
  assert.deepEqual(plain(m.apiGetPoll('', 'abcd1234')), expected);
  assert.deepEqual(lockLog, []);
});

test('a full round trip locks around writes only', () => {
  const { m, lockLog } = loadMain({ active: OWNER });
  const saved = plain(m.apiSavePoll('', sampleDraft()));
  assert.equal(saved.ok, true);
  assert.ok(Logic.isValidId(saved.data.pollId));
  const poll = plain(m.apiGetPublicPoll(saved.data.pollId));
  assert.equal(poll.ok, true);
  const answer = plain(m.apiSaveResponse(saved.data.pollId, poll.data.invitees[0].inviteeId, [poll.data.blocks[0].blockId], 1));
  assert.equal(answer.ok, true);
  assert.equal(plain(m.apiListPolls('')).data[0].respondedCount, 1);
  assert.equal(plain(m.apiGetPoll('', saved.data.pollId)).data.responses.length, 1);
  assert.deepEqual(lockLog, ['wait', 'release', 'wait', 'release']);
  assert.equal(plain(m.apiSaveResponse(saved.data.pollId, 'zzzzzzzz', [], 99)).code, 'stale');
  assert.deepEqual(lockLog.slice(-2), ['wait', 'release']);
});

test('invitee API works for anonymous visitors and reports errors as data', () => {
  const owner = loadMain({ active: OWNER });
  const saved = plain(owner.m.apiSavePoll('', sampleDraft()));
  const visitor = loadMain({ active: '' });
  assert.deepEqual(plain(visitor.m.apiGetPublicPoll('zzzzzzzz')),
    { ok: false, code: 'not_found', message: 'This poll is no longer available.' });
  assert.equal(saved.ok, true);

  const broken = loadMain({ active: '', openError: 'Sheet 1AbC is unreadable' });
  assert.deepEqual(plain(broken.m.apiGetPublicPoll('abcd1234')),
    { ok: false, code: 'server_error', message: 'Something went wrong.' });
  assert.deepEqual(broken.errors, ['Sheet 1AbC is unreadable']);
  const brokenOwner = loadMain({ active: OWNER, openError: 'Sheet 1AbC is unreadable' });
  assert.deepEqual(plain(brokenOwner.m.apiListPolls('')),
    { ok: false, code: 'server_error', message: 'Sheet 1AbC is unreadable' });

  const missingVisitor = loadMain({ active: '', sheetMissing: true });
  assert.deepEqual(plain(missingVisitor.m.apiGetPublicPoll('abcd1234')),
    { ok: false, code: 'sheet_missing', message: 'This poll is no longer available.' });
  assert.deepEqual(missingVisitor.errors, ['The data sheet is missing.'], 'the masked message is still logged');
  const missingOwner = loadMain({ active: OWNER, sheetMissing: true });
  assert.deepEqual(plain(missingOwner.m.apiListPolls('')),
    { ok: false, code: 'sheet_missing', message: 'The data sheet is missing.' });
  assert.deepEqual(missingOwner.errors, [], 'nothing is masked for the owner, so nothing extra is logged');
});

test('apiCreateDataSheet is owner-only and calls SheetStore.createNew', () => {
  const owner = loadMain({ active: OWNER });
  assert.deepEqual(plain(owner.m.apiCreateDataSheet('')), { ok: true, data: { created: true } });
  assert.equal(owner.calls.createNew, 1);
  const visitor = loadMain({ active: '' });
  assert.equal(plain(visitor.m.apiCreateDataSheet('')).code, 'not_owner');
  assert.equal(visitor.calls.createNew, 0);
});

test('setupAdminKey creates the key once', () => {
  const { m, props } = loadMain({ active: OWNER });
  m.setupAdminKey();
  const first = props.ADMIN_KEY;
  assert.match(first, /^[0-9a-f]{32}$/);
  m.setupAdminKey();
  assert.equal(props.ADMIN_KEY, first);
  assert.throws(() => loadMain({ active: '' }).m.setupAdminKey());
});
