/*
 * Mon–Fri calendar grid.
 *   mode 'edit':  empty cells and blocks are buttons (organizer step 2).
 *   mode 'names': each block lists every invitee with a checkbox (previews,
 *                 results and the invitee page).
 */
var Grid = (function () {
  var h = Dom.h;
  var narrowQuery = window.matchMedia ? window.matchMedia('(max-width: 767px)') : null;

  function isNarrow() {
    return !!(narrowQuery && narrowQuery.matches);
  }

  function onNarrowChange(fn) {
    if (!narrowQuery) return;
    if (narrowQuery.addEventListener) narrowQuery.addEventListener('change', fn);
    else if (narrowQuery.addListener) narrowQuery.addListener(fn);
  }

  function dayTabs(weekStart, selected, onSelect) {
    var dates = Logic.weekDates(weekStart);
    return h('div', { class: 'day-tabs', role: 'tablist', 'aria-label': 'Day of the week' }, dates.map(function (iso, i) {
      return h('button', {
        type: 'button',
        class: 'day-tab',
        role: 'tab',
        'aria-selected': i === selected ? 'true' : 'false',
        'aria-label': Logic.formatDayHeader(iso),
        'data-key': 'tab-' + i,
        onclick: function () { onSelect(i); }
      }, Logic.DAY_NAMES[i]);
    }));
  }

  function findStarting(blocks, day, t) {
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].day === day && blocks[i].startMin === t) return blocks[i];
    }
    return null;
  }

  function editCell(day, t, pos, dayLabel, opts) {
    return h('button', {
      type: 'button',
      class: 'cell',
      style: pos,
      'data-key': 'c-' + day + '-' + t,
      'aria-label': dayLabel + ', ' + Logic.formatTime(t) + ': add a time',
      onclick: function () { opts.onCellClick(day, t); }
    });
  }

  function editBlock(block, pos, dayLabel, opts) {
    var range = Logic.formatRange(block.startMin, opts.lengthMin);
    return h('button', {
      type: 'button',
      class: 'block block-edit',
      style: pos,
      title: 'Click to remove',
      'data-key': 'c-' + block.day + '-' + block.startMin,
      'aria-label': dayLabel + ', ' + range + ': remove this time',
      onclick: function () { opts.onBlockClick(block); }
    }, [h('span', { class: 'block-time' }, range), h('span', { class: 'block-hint' }, 'Click to remove')]);
  }

  function namesBlock(block, pos, dayLabel, opts) {
    var range = Logic.formatRange(block.startMin, opts.lengthMin);
    var ticks = (opts.ticks && opts.ticks[block.blockId]) || [];
    var count = (opts.counts && opts.counts[block.blockId]) || 0;
    var best = !!(block.blockId && opts.best && opts.best.indexOf(block.blockId) !== -1);
    var head = [h('span', { class: 'block-time' }, range)];
    if (opts.showCounts) head.push(h('span', { class: 'block-count' }, count + ' of ' + opts.invitees.length));
    return h('div', {
      class: 'block block-names' + (best ? ' block-best' : ''),
      style: pos,
      role: 'group',
      'aria-label': dayLabel + ', ' + range + (best ? ', most available' : '')
    }, [
      h('div', { class: 'block-head' }, head),
      best ? h('span', { class: 'badge-best' }, 'Most available') : null,
      h('ul', { class: 'name-list' }, opts.invitees.map(function (p) {
        var active = !!opts.activeInviteeId && p.inviteeId === opts.activeInviteeId;
        var box = h('input', {
          type: 'checkbox',
          checked: ticks.indexOf(p.inviteeId) !== -1,
          disabled: !active,
          'data-key': active ? 't-' + block.blockId : null,
          onchange: active ? function (e) { opts.onToggle(block.blockId, e.target.checked); } : null
        });
        // A disabled checkbox is drawn faint grey, so another person's tick also gets bold text and a visible mark.
        var ticked = !active && ticks.indexOf(p.inviteeId) !== -1;
        return h('li', { class: 'name-row' + (active ? ' name-row-active' : '') + (ticked ? ' name-row-ticked' : '') },
          h('label', null, [
            box,
            h('span', null, p.name),
            ticked ? h('span', { class: 'tick-mark', 'aria-hidden': 'true' }, '✓') : null
          ]));
      }))
    ]);
  }

  function render(opts) {
    var dates = Logic.weekDates(opts.weekStart);
    var days = opts.dayFilter === null || opts.dayFilter === undefined ? [0, 1, 2, 3, 4] : [opts.dayFilter];
    var rows = Logic.rowStarts();
    var span = opts.lengthMin / Logic.STEP;
    var children = [h('div', { class: 'grid-corner', style: { gridRow: '1', gridColumn: '1' } })];

    days.forEach(function (day, ci) {
      children.push(h('div', { class: 'grid-day', style: { gridRow: '1', gridColumn: String(ci + 2) } },
        Logic.formatDayHeader(dates[day])));
    });
    rows.forEach(function (t, ri) {
      children.push(h('div', { class: 'grid-time' + (t % 60 === 0 ? ' on-hour' : ''),
        style: { gridRow: String(ri + 2), gridColumn: '1' } }, Logic.formatTime(t)));
    });
    days.forEach(function (day, ci) {
      var col = String(ci + 2);
      var dayLabel = Logic.formatDayHeader(dates[day]);
      var ri = 0;
      while (ri < rows.length) {
        var block = findStarting(opts.blocks, day, rows[ri]);
        if (block) {
          var rowSpan = Math.min(span, rows.length - ri);
          var pos = { gridRow: (ri + 2) + ' / span ' + rowSpan, gridColumn: col };
          children.push(opts.mode === 'edit' ? editBlock(block, pos, dayLabel, opts) : namesBlock(block, pos, dayLabel, opts));
          ri += rowSpan;
        } else {
          var cellPos = { gridRow: String(ri + 2), gridColumn: col };
          children.push(opts.mode === 'edit'
            ? editCell(day, rows[ri], cellPos, dayLabel, opts)
            : h('div', { class: 'cell', style: cellPos, 'aria-hidden': 'true' }));
          ri += 1;
        }
      }
    });
    return h('div', {
      class: 'grid grid-' + opts.mode,
      style: { gridTemplateColumns: '4.75rem repeat(' + days.length + ', minmax(0, 1fr))' }
    }, children);
  }

  return { render: render, dayTabs: dayTabs, isNarrow: isNarrow, onNarrowChange: onNarrowChange };
})();
