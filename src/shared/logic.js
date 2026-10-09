/*
 * Meeting Scheduler — rules shared by the Apps Script server and the browser.
 * Pure functions only: no Google Apps Script, DOM or Node APIs.
 * Times are minutes after midnight; dates are ISO strings (YYYY-MM-DD).
 */
var Logic = (function () {
  var api = {};

  var GRID_START = 480; // 8:00 AM
  var GRID_END = 1080; // 6:00 PM
  var STEP = 30;
  var LENGTHS = [30, 60, 90];
  var DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var TITLE_MAX = 120;
  var NAME_MAX = 60;
  var DASH = '–';

  api.GRID_START = GRID_START;
  api.GRID_END = GRID_END;
  api.STEP = STEP;
  api.LENGTHS = LENGTHS;
  api.DAY_NAMES = DAY_NAMES;
  api.TITLE_MAX = TITLE_MAX;
  api.NAME_MAX = NAME_MAX;

  // ---- Dates and times ----------------------------------------------------

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function parseIso(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso == null ? '' : iso));
    if (!m) return null;
    var y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
    var date = new Date(Date.UTC(y, mo, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo || date.getUTCDate() !== d) return null;
    return date;
  }

  function toIso(date) {
    return date.getUTCFullYear() + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate());
  }

  function addDays(iso, n) {
    var date = parseIso(iso);
    date.setUTCDate(date.getUTCDate() + n);
    return toIso(date);
  }

  function weekStartFor(iso) {
    var date = parseIso(iso);
    if (!date) return null;
    var dow = date.getUTCDay();
    var offset = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
    return addDays(iso, offset);
  }

  function isMonday(iso) {
    var date = parseIso(iso);
    return !!date && date.getUTCDay() === 1;
  }

  function weekDates(weekStart) {
    var out = [];
    for (var i = 0; i < 5; i++) out.push(addDays(weekStart, i));
    return out;
  }

  function formatDayHeader(iso) {
    var date = parseIso(iso);
    return WEEKDAYS[date.getUTCDay()] + ', ' + MONTHS[date.getUTCMonth()] + ' ' + date.getUTCDate();
  }

  function formatWeekRange(weekStart) {
    var a = parseIso(weekStart);
    var b = parseIso(addDays(weekStart, 4));
    var am = MONTHS[a.getUTCMonth()], bm = MONTHS[b.getUTCMonth()];
    var ay = a.getUTCFullYear(), by = b.getUTCFullYear();
    if (ay !== by) {
      return am + ' ' + a.getUTCDate() + ', ' + ay + ' ' + DASH + ' ' + bm + ' ' + b.getUTCDate() + ', ' + by;
    }
    if (am !== bm) return am + ' ' + a.getUTCDate() + ' ' + DASH + ' ' + bm + ' ' + b.getUTCDate() + ', ' + by;
    return am + ' ' + a.getUTCDate() + DASH + b.getUTCDate() + ', ' + by;
  }

  function todayIso(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  function isPastWeek(weekStart, today) {
    return addDays(weekStart, 4) < today;
  }

  function formatTime(min) {
    var h = Math.floor(min / 60), m = min % 60;
    var h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + pad2(m) + ' ' + (h >= 12 ? 'PM' : 'AM');
  }

  function formatRange(startMin, lengthMin) {
    var a = formatTime(startMin), b = formatTime(startMin + lengthMin);
    if (a.slice(-2) === b.slice(-2)) return a.slice(0, -3) + DASH + b;
    return a + DASH + b;
  }

  function rowStarts() {
    var out = [];
    for (var t = GRID_START; t < GRID_END; t += STEP) out.push(t);
    return out;
  }

  api.weekStartFor = weekStartFor;
  api.isMonday = isMonday;
  api.weekDates = weekDates;
  api.formatDayHeader = formatDayHeader;
  api.formatWeekRange = formatWeekRange;
  api.todayIso = todayIso;
  api.isPastWeek = isPastWeek;
  api.formatTime = formatTime;
  api.formatRange = formatRange;
  api.rowStarts = rowStarts;

  return api;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
