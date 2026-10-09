/*
 * Meeting Scheduler — Google Sheet implementation of the table store
 * (Apps Script only, apart from the pure codec exported for tests).
 * One tab per table; row 1 holds column names; every cell is plain text.
 */
var SheetStore = (function () {
  var SHEET_NAME = 'Meeting Scheduler Data';
  var PROP_ID = 'DATA_SHEET_ID';
  var PROP_PREVIOUS = 'DATA_SHEET_ID_PREVIOUS';
  var TABS = [
    { name: 'Polls', key: 'polls', cols: ['pollId', 'title', 'weekStart', 'lengthMin', 'version', 'createdAt', 'updatedAt'] },
    { name: 'Blocks', key: 'blocks', cols: ['pollId', 'blockId', 'day', 'startMin'] },
    { name: 'Invitees', key: 'invitees', cols: ['pollId', 'inviteeId', 'name', 'order', 'respondedAt'] },
    { name: 'Responses', key: 'responses', cols: ['pollId', 'inviteeId', 'blockId'] }
  ];
  var NUMERIC = { lengthMin: true, version: true, day: true, startMin: true, order: true };
  var NEEDS_ESCAPE = /^['=+\-@]/; // formula-like text, plus any leading apostrophe, so decoding is lossless

  function encodeCell(col, value) {
    if (NUMERIC[col]) return String(Number(value));
    var s = value == null ? '' : String(value);
    return NEEDS_ESCAPE.test(s) ? "'" + s : s;
  }

  function decodeCell(col, value) {
    if (Object.prototype.toString.call(value) === '[object Date]') value = formatDateCell(col, value);
    if (NUMERIC[col]) return Number(value);
    var s = value == null ? '' : String(value);
    return s.charAt(0) === "'" && NEEDS_ESCAPE.test(s.slice(1)) ? s.slice(1) : s;
  }

  // Guard: cells are written as plain text, but if Sheets ever hands back a Date, restore the string.
  function formatDateCell(col, date) {
    if (col === 'weekStart') return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    return Utilities.formatDate(date, 'UTC', "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'");
  }

  function rowToObject(cols, row) {
    var o = {};
    cols.forEach(function (c, i) { o[c] = decodeCell(c, row[i]); });
    return o;
  }

  function objectToRow(cols, obj) {
    return cols.map(function (c) { return encodeCell(c, obj[c]); });
  }

  function ensureTabs(ss) {
    TABS.forEach(function (tab) {
      if (ss.getSheetByName(tab.name)) return;
      var sheet = ss.insertSheet(tab.name);
      sheet.getRange(1, 1, 1, tab.cols.length).setValues([tab.cols]).setFontWeight('bold');
      sheet.setFrozenRows(1);
    });
    var stray = ss.getSheetByName('Sheet1');
    if (stray && ss.getSheets().length > TABS.length) ss.deleteSheet(stray);
  }

  function readAll(ss) {
    var out = {};
    TABS.forEach(function (tab) {
      var sheet = ss.getSheetByName(tab.name);
      var last = sheet.getLastRow();
      out[tab.key] = last < 2 ? [] : sheet.getRange(2, 1, last - 1, tab.cols.length).getValues()
        .filter(function (row) { return row[0] !== ''; })
        .map(function (row) { return rowToObject(tab.cols, row); });
    });
    return out;
  }

  function tableRows(tab, tables) {
    return (tables[tab.key] || []).map(function (o) { return objectToRow(tab.cols, o); });
  }

  // One JSON string per table, comparable with the rows writeAll would produce.
  function snapshot(tables) {
    var out = {};
    TABS.forEach(function (tab) { out[tab.key] = JSON.stringify(tableRows(tab, tables)); });
    return out;
  }

  // `unchanged` (optional) maps a table key to the snapshot taken when it was last read;
  // a tab whose new rows match it is left alone. Without it, every tab is written.
  function writeAll(ss, tables, unchanged) {
    TABS.forEach(function (tab) {
      var rows = tableRows(tab, tables);
      if (unchanged && unchanged[tab.key] === JSON.stringify(rows)) return;
      var sheet = ss.getSheetByName(tab.name);
      var last = sheet.getLastRow();
      // Write the new rows first (growing the grid if needed), then clear leftover old rows,
      // so a failure part-way never leaves a tab empty.
      if (rows.length) {
        var missing = rows.length + 1 - sheet.getMaxRows();
        if (missing > 0) sheet.insertRowsAfter(sheet.getMaxRows(), missing);
        var range = sheet.getRange(2, 1, rows.length, tab.cols.length);
        range.setNumberFormat('@');
        range.setValues(rows);
      }
      if (last > rows.length + 1) {
        sheet.getRange(rows.length + 2, 1, last - rows.length - 1, tab.cols.length).clearContent();
      }
    });
  }

  function open() {
    var props = PropertiesService.getScriptProperties();
    var id = props.getProperty(PROP_ID);
    var ss;
    if (!id) {
      ss = SpreadsheetApp.create(SHEET_NAME);
      props.setProperty(PROP_ID, ss.getId());
    } else {
      try {
        ss = SpreadsheetApp.openById(id);
      } catch (err) {
        throw new Service.ServiceError('sheet_missing', 'The data sheet is missing.');
      }
    }
    ensureTabs(ss);
    var seen = null; // snapshot of each table as last read or written, so unchanged tabs are not rewritten
    return {
      read: function () {
        var tables = readAll(ss);
        seen = snapshot(tables);
        return tables;
      },
      write: function (tables) {
        var before = seen;
        seen = null; // if the write fails part-way, the next write must not trust the old snapshot
        try {
          writeAll(ss, tables, before);
        } finally {
          // Apps Script batches Sheet writes; commit them (even a partial write) before the caller releases the lock
          SpreadsheetApp.flush();
        }
        seen = snapshot(tables);
      }
    };
  }

  // Starts a fresh data sheet. The old sheet's id is kept in DATA_SHEET_ID_PREVIOUS (and logged), so a
  // sheet that was replaced by mistake can be put back by copying that id into DATA_SHEET_ID.
  function createNew() {
    var props = PropertiesService.getScriptProperties();
    var oldId = props.getProperty(PROP_ID);
    if (oldId) {
      props.setProperty(PROP_PREVIOUS, oldId);
      console.error('Replacing data sheet ' + oldId);
    }
    props.deleteProperty(PROP_ID);
    return open();
  }

  return {
    open: open,
    createNew: createNew,
    _codec: { TABS: TABS, encodeCell: encodeCell, decodeCell: decodeCell, rowToObject: rowToObject, objectToRow: objectToRow },
    _io: { ensureTabs: ensureTabs, readAll: readAll, writeAll: writeAll, snapshot: snapshot }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SheetStore;
