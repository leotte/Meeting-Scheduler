const test = require('node:test');
const assert = require('node:assert/strict');
const Logic = require('../src/shared/logic.js');

test('constants describe the grid', () => {
  assert.equal(Logic.GRID_START, 480);
  assert.equal(Logic.GRID_END, 1080);
  assert.equal(Logic.STEP, 30);
  assert.deepEqual(Logic.LENGTHS, [30, 60, 90]);
  assert.deepEqual(Logic.DAY_NAMES, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  assert.equal(Logic.TITLE_MAX, 120);
  assert.equal(Logic.NAME_MAX, 60);
});

test('weekStartFor maps weekdays to their Monday', () => {
  assert.equal(Logic.weekStartFor('2026-10-19'), '2026-10-19');
  assert.equal(Logic.weekStartFor('2026-10-21'), '2026-10-19');
  assert.equal(Logic.weekStartFor('2026-10-23'), '2026-10-19');
});

test('weekStartFor maps weekends to the following Monday', () => {
  assert.equal(Logic.weekStartFor('2026-10-24'), '2026-10-26');
  assert.equal(Logic.weekStartFor('2026-10-25'), '2026-10-26');
});

test('weekStartFor crosses month and year boundaries', () => {
  assert.equal(Logic.weekStartFor('2026-12-04'), '2026-11-30');
  assert.equal(Logic.weekStartFor('2026-01-01'), '2025-12-29');
});

test('weekStartFor rejects invalid dates', () => {
  assert.equal(Logic.weekStartFor('2026-02-30'), null);
  assert.equal(Logic.weekStartFor(''), null);
  assert.equal(Logic.weekStartFor(null), null);
  assert.equal(Logic.weekStartFor('10/19/2026'), null);
});

test('isMonday', () => {
  assert.equal(Logic.isMonday('2026-10-19'), true);
  assert.equal(Logic.isMonday('2026-10-20'), false);
  assert.equal(Logic.isMonday('garbage'), false);
  assert.equal(Logic.isMonday(undefined), false);
});

test('weekDates lists Monday to Friday', () => {
  assert.deepEqual(Logic.weekDates('2026-10-19'),
    ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23']);
});

test('formatDayHeader', () => {
  assert.equal(Logic.formatDayHeader('2026-10-19'), 'Mon, Oct 19');
  assert.equal(Logic.formatDayHeader('2026-10-23'), 'Fri, Oct 23');
});

test('formatWeekRange within a month, across months and across years', () => {
  assert.equal(Logic.formatWeekRange('2026-10-19'), 'Oct 19–23, 2026');
  assert.equal(Logic.formatWeekRange('2026-11-30'), 'Nov 30 – Dec 4, 2026');
  assert.equal(Logic.formatWeekRange('2025-12-29'), 'Dec 29, 2025 – Jan 2, 2026');
});

test('todayIso uses the local calendar date', () => {
  assert.equal(Logic.todayIso(new Date(2026, 9, 9, 23, 30)), '2026-10-09');
  assert.equal(Logic.todayIso(new Date(2026, 0, 5)), '2026-01-05');
});

test('isPastWeek is true only once the Friday has passed', () => {
  assert.equal(Logic.isPastWeek('2026-10-05', '2026-10-09'), false);
  assert.equal(Logic.isPastWeek('2026-10-05', '2026-10-10'), true);
  assert.equal(Logic.isPastWeek('2026-09-28', '2026-10-09'), true);
  assert.equal(Logic.isPastWeek('2026-10-19', '2026-10-09'), false);
});

test('formatTime', () => {
  assert.equal(Logic.formatTime(480), '8:00 AM');
  assert.equal(Logic.formatTime(690), '11:30 AM');
  assert.equal(Logic.formatTime(720), '12:00 PM');
  assert.equal(Logic.formatTime(750), '12:30 PM');
  assert.equal(Logic.formatTime(1050), '5:30 PM');
  assert.equal(Logic.formatTime(1080), '6:00 PM');
});

test('formatRange drops a repeated AM/PM', () => {
  assert.equal(Logic.formatRange(540, 60), '9:00–10:00 AM');
  assert.equal(Logic.formatRange(690, 60), '11:30 AM–12:30 PM');
  assert.equal(Logic.formatRange(1020, 60), '5:00–6:00 PM');
  assert.equal(Logic.formatRange(930, 90), '3:30–5:00 PM');
});

test('rowStarts lists 20 half-hour rows', () => {
  const rows = Logic.rowStarts();
  assert.equal(rows.length, 20);
  assert.equal(rows[0], 480);
  assert.equal(rows[1], 510);
  assert.equal(rows[19], 1050);
});
