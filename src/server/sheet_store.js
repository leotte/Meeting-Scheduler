/*
 * Meeting Scheduler — Google Sheet implementation of the table store
 * (Apps Script only, apart from the pure codec exported for tests).
 * One tab per table; row 1 holds column names; every cell is plain text.
 */
var SheetStore = (function () {
  var SHEET_NAME = 'Meeting Scheduler Data';
  var PROP_ID = 'DATA_SHEET_ID';
  var TABS = [
    { name: 'Polls', key: 'polls', cols: ['pollId', 'title', 'weekStart', 'lengthMin', 'version', 'createdAt', 'updatedAt'] },
    { name: 'Blocks', key: 'blocks', cols: ['pollId', 'blockId', 'day', 'startMin'] },
    { name: 'Invitees', key: 'invitees', cols: ['pollId', 'inviteeId', 'name', 'order', 'respondedAt'] },
    { name: 'Responses', key: 'responses', cols: ['pollId', 'inviteeId', 'blockId'] }
  ];
  var NUMERIC = { lengthMin: true, version: true, day: true, startMin: true, order: true };
  var RISKY = /^[=+\-@]/; // would be read as a formula

  function encodeCell(col, value) {
    if (NUMERIC[col]) return String(Number(value));
    var s = value == null ? '' : String(value);
    return RISKY.test(s) ? "'" + s : s;
  }

  function decodeCell(col, value) {
    if (Object.prototype.toString.call(value) === '[object Date]') value = formatDateCell(col, value);
    if (NUMERIC[col]) return Number(value);
    var s = value == null ? '' : String(value);
    return s.charAt(0) === "'" && RISKY.test(s.slice(1)) ? s.slice(1) : s;
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

  function writeAll(ss, tables) {
    TABS.forEach(function (tab) {
      var sheet = ss.getSheetByName(tab.name);
      var rows = (tables[tab.key] || []).map(function (o) { return objectToRow(tab.cols, o); });
      var last = sheet.getLastRow();
      if (last > 1) sheet.getRange(2, 1, last - 1, tab.cols.length).clearContent();
      if (rows.length) {
        var range = sheet.getRange(2, 1, rows.length, tab.cols.length);
        range.setNumberFormat('@');
        range.setValues(rows);
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
    return {
      read: function () { return readAll(ss); },
      write: function (tables) { writeAll(ss, tables); }
    };
  }

  function createNew() {
    PropertiesService.getScriptProperties().deleteProperty(PROP_ID);
    return open();
  }

  return {
    open: open,
    createNew: createNew,
    _codec: { TABS: TABS, encodeCell: encodeCell, decodeCell: decodeCell, rowToObject: rowToObject, objectToRow: objectToRow }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = SheetStore;
