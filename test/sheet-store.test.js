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
  for (const s of ["'=foo", "''", "'Ana", "'@x"]) {
    assert.equal(C.decodeCell('name', C.encodeCell('name', s)), s, s);
  }
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

// A small fake spreadsheet that follows the Apps Script rules the store depends on:
// new sheets have a fixed grid, and getRange throws when it reaches past the last row.
function fakeSpreadsheet(startRows) {
  const sheets = [{ name: 'Sheet1', maxRows: startRows, cells: [], writes: 0 }];
  function wrap(sheet) {
    if (sheet.api) return sheet.api;
    const api = {
      getMaxRows: () => sheet.maxRows,
      insertRowsAfter: (after, n) => { sheet.maxRows += n; },
      getLastRow: () => {
        let last = 0;
        sheet.cells.forEach((row, r) => { if (row && row.some((v) => v !== '')) last = r + 1; });
        return last;
      },
      setFrozenRows: () => {},
      getRange: (row, col, numRows, numCols) => {
        if (row + numRows - 1 > sheet.maxRows) {
          throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
        }
        const range = {
          setValues: (values) => {
            sheet.writes++;
            values.forEach((vals, i) => {
              const r = row - 1 + i;
              sheet.cells[r] = sheet.cells[r] || [];
              vals.forEach((v, j) => { sheet.cells[r][col - 1 + j] = v; });
            });
            return range;
          },
          getValues: () => {
            const out = [];
            for (let i = 0; i < numRows; i++) {
              const src = sheet.cells[row - 1 + i] || [];
              const line = [];
              for (let j = 0; j < numCols; j++) {
                const v = src[col - 1 + j];
                line.push(v === undefined ? '' : v);
              }
              out.push(line);
            }
            return out;
          },
          clearContent: () => {
            sheet.writes++;
            for (let i = 0; i < numRows; i++) {
              const r = row - 1 + i;
              for (let j = 0; j < numCols; j++) if (sheet.cells[r]) sheet.cells[r][col - 1 + j] = '';
            }
            return range;
          },
          setNumberFormat: () => range,
          setFontWeight: () => range
        };
        return range;
      }
    };
    sheet.api = api;
    return api;
  }
  return {
    getSheetByName: (name) => { const s = sheets.find((x) => x.name === name); return s ? wrap(s) : null; },
    insertSheet: (name) => { const s = { name, maxRows: startRows, cells: [], writes: 0 }; sheets.push(s); return wrap(s); },
    getSheets: () => sheets.map(wrap),
    deleteSheet: (api) => { sheets.splice(sheets.findIndex((s) => s.api === api), 1); },
    names: () => sheets.map((s) => s.name),
    // How many times each tab has been written to (setValues or clearContent) so far.
    writes: () => Object.fromEntries(sheets.map((s) => [s.name, s.writes]))
  };
}

test('sheet I/O grows the grid and clears leftover rows', () => {
  const io = SheetStore._io;
  const ss = fakeSpreadsheet(5);
  io.ensureTabs(ss);
  assert.deepEqual(ss.names(), ['Polls', 'Blocks', 'Invitees', 'Responses']);

  const tables = {
    polls: [{ pollId: 'abcdEFGH', title: '=Budget', weekStart: '2026-10-19', lengthMin: 60, version: 3,
      createdAt: '2026-10-09T12:00:00.000Z', updatedAt: '2026-10-09T12:05:00.000Z' }],
    blocks: [
      { pollId: 'abcdEFGH', blockId: 'blk00001', day: 0, startMin: 540 },
      { pollId: 'abcdEFGH', blockId: 'blk00002', day: 4, startMin: 1050 }
    ],
    invitees: [
      { pollId: 'abcdEFGH', inviteeId: 'inv00001', name: 'Ana G\u00f3mez', order: 0, respondedAt: '2026-10-09T13:00:00.000Z' },
      { pollId: 'abcdEFGH', inviteeId: 'inv00002', name: "'=Sam", order: 1, respondedAt: '' }
    ],
    responses: []
  };
  for (let i = 0; i < 10; i++) {
    tables.responses.push({
      pollId: 'abcdEFGH',
      inviteeId: i % 2 ? 'inv00002' : 'inv00001',
      blockId: 'blk' + String(i + 1).padStart(5, '0')
    });
  }

  io.writeAll(ss, tables); // 10 responses need 11 rows, more than the 5-row grid
  assert.deepEqual(io.readAll(ss), tables);

  const fewer = Object.assign({}, tables, { responses: tables.responses.slice(0, 3) });
  io.writeAll(ss, fewer);
  const after = io.readAll(ss);
  assert.deepEqual(after.responses, tables.responses.slice(0, 3));
  assert.deepEqual(after.polls, tables.polls);
  assert.deepEqual(after.blocks, tables.blocks);
  assert.deepEqual(after.invitees, tables.invitees);

  // With a snapshot of what was read, tabs whose rows are identical are not touched at all.
  const seen = io.snapshot(after);
  const quiet = ss.writes();
  io.writeAll(ss, after, seen);
  assert.deepEqual(ss.writes(), quiet, 'nothing changed, nothing written');
  io.writeAll(ss, Object.assign({}, after, { responses: after.responses.slice(0, 1) }), seen);
  const now = ss.writes();
  assert.ok(now.Responses > quiet.Responses, 'the changed tab is written');
  ['Polls', 'Blocks', 'Invitees'].forEach((n) => assert.equal(now[n], quiet[n], n + ' left alone'));
  assert.deepEqual(io.readAll(ss).responses, after.responses.slice(0, 1));
  // Without a snapshot every tab is written, as before.
  io.writeAll(ss, after);
  ['Polls', 'Blocks', 'Invitees', 'Responses'].forEach((n) => assert.ok(ss.writes()[n] > now[n], n + ' rewritten'));
  assert.deepEqual(io.readAll(ss), after);
});

// open() is the only place that touches Apps Script globals; run it against stand-ins.
function withAppsScriptGlobals(ss, fn) {
  const store = {};
  const events = [];
  const saved = {};
  const names = ['PropertiesService', 'SpreadsheetApp', 'Service'];
  names.forEach((n) => { saved[n] = Object.getOwnPropertyDescriptor(globalThis, n); });
  globalThis.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (k in store ? store[k] : null),
      setProperty: (k, v) => { store[k] = v; },
      deleteProperty: (k) => { delete store[k]; }
    })
  };
  globalThis.SpreadsheetApp = {
    create: () => ss,
    openById: () => ss,
    flush: () => { events.push('flush'); }
  };
  globalThis.Service = { ServiceError: class extends Error {} };
  try {
    return fn(store, events);
  } finally {
    names.forEach((n) => {
      if (saved[n]) Object.defineProperty(globalThis, n, saved[n]);
      else delete globalThis[n];
    });
  }
}

test('open() flushes the sheet right after every write', () => {
  const ss = fakeSpreadsheet(5);
  ss.getId = () => 'sheet-1';
  withAppsScriptGlobals(ss, (props, events) => {
    const db = SheetStore.open();
    assert.equal(props.DATA_SHEET_ID, 'sheet-1');
    const tables = db.read();
    assert.deepEqual(events, []);
    db.write(Object.assign({}, tables, {
      blocks: [{ pollId: 'abcdEFGH', blockId: 'blk00001', day: 0, startMin: 540 }]
    }));
    assert.deepEqual(events, ['flush']);
    assert.equal(db.read().blocks.length, 1);
  });
});

test('open() skips tabs that did not change since they were read', () => {
  const ss = fakeSpreadsheet(5);
  ss.getId = () => 'sheet-2';
  withAppsScriptGlobals(ss, (props, events) => {
    const db = SheetStore.open();
    const tables = db.read();
    tables.polls = [{ pollId: 'abcdEFGH', title: 'Budget', weekStart: '2026-10-19', lengthMin: 60, version: 1,
      createdAt: '2026-10-09T12:00:00.000Z', updatedAt: '2026-10-09T12:00:00.000Z' }];
    tables.blocks = [{ pollId: 'abcdEFGH', blockId: 'blk00001', day: 0, startMin: 540 }];
    db.write(tables); // first write after read: polls and blocks changed
    let w = ss.writes();

    const again = db.read();
    db.write(again); // nothing changed
    assert.deepEqual(ss.writes(), w, 'an unchanged save writes no tab');
    assert.deepEqual(events, ['flush', 'flush'], 'but the write is still flushed');

    again.blocks = again.blocks.concat([{ pollId: 'abcdEFGH', blockId: 'blk00002', day: 1, startMin: 600 }]);
    db.write(again);
    const after = ss.writes();
    assert.ok(after.Blocks > w.Blocks);
    ['Polls', 'Invitees', 'Responses'].forEach((n) => assert.equal(after[n], w[n], n + ' left alone'));

    // A second write without a fresh read compares against what the last write left behind.
    w = ss.writes();
    db.write(again);
    assert.deepEqual(ss.writes(), w);
    assert.equal(db.read().blocks.length, 2);
  });
});

test('createNew() keeps the replaced sheet id in DATA_SHEET_ID_PREVIOUS and logs it', () => {
  const ss = fakeSpreadsheet(5);
  ss.getId = () => 'sheet-new';
  const logged = [];
  const realError = console.error;
  console.error = (msg) => { logged.push(msg); };
  try {
    withAppsScriptGlobals(ss, (props) => {
      props.DATA_SHEET_ID = 'sheet-old';
      SheetStore.createNew();
      assert.equal(props.DATA_SHEET_ID, 'sheet-new');
      assert.equal(props.DATA_SHEET_ID_PREVIOUS, 'sheet-old');
      assert.deepEqual(logged, ['Replacing data sheet sheet-old']);
    });
    logged.length = 0;
    const second = fakeSpreadsheet(5);
    second.getId = () => 'sheet-second';
    withAppsScriptGlobals(second, (props) => {
      props.DATA_SHEET_ID_PREVIOUS = 'sheet-older';
      SheetStore.createNew(); // no current id: nothing to remember, nothing to overwrite
      assert.equal(props.DATA_SHEET_ID_PREVIOUS, 'sheet-older');
      assert.deepEqual(logged, []);
    });
  } finally {
    console.error = realError;
  }
});
