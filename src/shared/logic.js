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

  // ---- Blocks -------------------------------------------------------------

  function sortBlocks(blocks) {
    return blocks.slice().sort(function (a, b) { return a.day - b.day || a.startMin - b.startMin; });
  }

  function overlaps(aStart, bStart, lengthMin) {
    return aStart < bStart + lengthMin && bStart < aStart + lengthMin;
  }

  function checkPlacement(blocks, day, startMin, lengthMin) {
    if (typeof day !== 'number' || typeof startMin !== 'number') return { ok: false, reason: 'invalid' };
    if (!(day >= 0 && day <= 4 && day % 1 === 0)) return { ok: false, reason: 'invalid' };
    if (startMin % STEP !== 0 || startMin < GRID_START) return { ok: false, reason: 'invalid' };
    if (startMin + lengthMin > GRID_END) return { ok: false, reason: 'past_end' };
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.day === day && overlaps(b.startMin, startMin, lengthMin)) {
        return { ok: false, reason: 'overlap', conflict: b };
      }
    }
    return { ok: true };
  }

  function placementMessage(result, lengthMin) {
    if (result.reason === 'past_end') return 'Would end after 6:00 PM';
    if (result.reason === 'overlap') return 'Overlaps the ' + formatRange(result.conflict.startMin, lengthMin) + ' block';
    if (result.reason === 'invalid') return 'That time is outside the calendar';
    return '';
  }

  function resizeBlocks(blocks, newLength) {
    var kept = [], removed = [];
    sortBlocks(blocks).forEach(function (b) {
      if (checkPlacement(kept, b.day, b.startMin, newLength).ok) kept.push(b);
      else removed.push(b);
    });
    return { kept: kept, removed: removed };
  }

  function blockLabel(block, lengthMin) {
    return DAY_NAMES[block.day] + ' ' + formatRange(block.startMin, lengthMin);
  }

  // ---- Names --------------------------------------------------------------

  function normalizeName(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function nameKey(value) {
    return normalizeName(value).toLowerCase();
  }

  function parseNameList(text) {
    return String(text == null ? '' : text).split(/\r?\n/).map(normalizeName)
      .filter(function (n) { return n !== ''; });
  }

  function findDuplicateNames(names) {
    var seen = {}, dups = [];
    names.forEach(function (n) {
      var k = nameKey(n);
      if (seen[k]) dups.push(n);
      seen[k] = true;
    });
    return dups;
  }

  // ---- Draft validation ---------------------------------------------------

  function validateDraft(draft) {
    draft = draft || {};
    var errors = [];
    var title = normalizeName(draft.title);
    if (!title) errors.push('Add a title.');
    else if (title.length > TITLE_MAX) errors.push('The title must be ' + TITLE_MAX + ' characters or fewer.');
    if (!isMonday(draft.weekStart)) errors.push('Pick a week.');
    var lengthOk = LENGTHS.indexOf(draft.lengthMin) !== -1;
    if (!lengthOk) errors.push('Pick a meeting length of 30, 60 or 90 minutes.');
    var blocks = Array.isArray(draft.blocks) ? draft.blocks : [];
    if (blocks.length === 0) errors.push('Add at least one time.');
    if (lengthOk) {
      var placed = [];
      for (var i = 0; i < blocks.length; i++) {
        if (!checkPlacement(placed, blocks[i].day, blocks[i].startMin, draft.lengthMin).ok) {
          errors.push('Times must not overlap and must end by 6:00 PM.');
          break;
        }
        placed.push(blocks[i]);
      }
    }
    var invitees = Array.isArray(draft.invitees) ? draft.invitees : [];
    if (invitees.length === 0) errors.push('Add at least one invitee.');
    var names = invitees.map(function (p) { return normalizeName(p && p.name); });
    if (names.some(function (n) { return n === ''; })) errors.push('Invitee names cannot be blank.');
    if (names.some(function (n) { return n.length > NAME_MAX; })) {
      errors.push('Names must be ' + NAME_MAX + ' characters or fewer.');
    }
    var dups = findDuplicateNames(names.filter(function (n) { return n !== ''; }));
    if (dups.length) errors.push('Duplicate names: ' + dups.join(', ') + '.');
    return errors;
  }

  api.sortBlocks = sortBlocks;
  api.checkPlacement = checkPlacement;
  api.placementMessage = placementMessage;
  api.resizeBlocks = resizeBlocks;
  api.blockLabel = blockLabel;
  api.normalizeName = normalizeName;
  api.nameKey = nameKey;
  api.parseNameList = parseNameList;
  api.findDuplicateNames = findDuplicateNames;
  api.validateDraft = validateDraft;

  return api;
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Logic;
