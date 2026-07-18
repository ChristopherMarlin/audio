/**
 * A small dependency-free date-range picker used for choosing pickup/return
 * dates. Renders one month at a time and refuses to let a customer select
 * any range that overlaps a date already reported unavailable by the server.
 */
function createRangeCalendar({ container, onChange }) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let viewMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  let unavailable = []; // [{start:'YYYY-MM-DD', end:'YYYY-MM-DD'}] end-exclusive
  let start = null;
  let end = null;

  function toStr(d) { return d.toISOString().slice(0, 10); }
  function isPast(dateStr) { return dateStr < toStr(today); }
  function isUnavailable(dateStr) {
    return unavailable.some((r) => dateStr >= r.start && dateStr < r.end);
  }
  function isRangeClean(s, e) {
    const d = new Date(s + 'T00:00:00Z');
    const endD = new Date(e + 'T00:00:00Z');
    while (d < endD) {
      if (isUnavailable(toStr(d))) return false;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return true;
  }

  function render() {
    const year = viewMonth.getUTCFullYear();
    const month = viewMonth.getUTCMonth();
    const firstDay = new Date(Date.UTC(year, month, 1));
    const startOffset = firstDay.getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const monthName = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

    let html = `<div class="calendar__header">
      <button type="button" data-nav="prev" aria-label="Previous month">&larr;</button>
      <strong>${monthName}</strong>
      <button type="button" data-nav="next" aria-label="Next month">&rarr;</button>
    </div>
    <div class="calendar__grid">
      ${['Su','Mo','Tu','We','Th','Fr','Sa'].map((d) => `<div class="dow">${d}</div>`).join('')}`;

    for (let i = 0; i < startOffset; i++) html += `<div class="calendar__day empty"></div>`;

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = toStr(new Date(Date.UTC(year, month, day)));
      const classes = ['calendar__day'];
      if (isPast(dateStr)) classes.push('past');
      else if (isUnavailable(dateStr)) classes.push('unavailable');
      if (dateStr === start || dateStr === end) classes.push('selected');
      else if (start && end && dateStr > start && dateStr < end) classes.push('in-range');
      html += `<div class="${classes.join(' ')}" data-date="${dateStr}">${day}</div>`;
    }
    html += `</div>
    <div class="calendar__legend">
      <span><i class="dot" style="background:var(--teal-700)"></i> Selected</span>
      <span><i class="dot" style="background:#f1d4d6"></i> Unavailable</span>
      <span><i class="dot" style="background:var(--sun)"></i> Your trip</span>
    </div>`;

    container.innerHTML = html;

    container.querySelector('[data-nav="prev"]').addEventListener('click', () => {
      viewMonth = new Date(Date.UTC(year, month - 1, 1));
      render();
    });
    container.querySelector('[data-nav="next"]').addEventListener('click', () => {
      viewMonth = new Date(Date.UTC(year, month + 1, 1));
      render();
    });
    container.querySelectorAll('.calendar__day[data-date]').forEach((el) => {
      el.addEventListener('click', () => handleDayClick(el.dataset.date));
    });
  }

  function handleDayClick(dateStr) {
    if (isPast(dateStr) || isUnavailable(dateStr)) return;

    if (!start || (start && end)) {
      start = dateStr;
      end = null;
    } else if (dateStr === start) {
      // no-op, need a different day for the return date
    } else if (dateStr < start) {
      start = dateStr;
      end = null;
    } else {
      if (isRangeClean(start, dateStr)) {
        end = dateStr;
      } else {
        // Range would cross an unavailable day - restart selection from here instead.
        start = dateStr;
        end = null;
      }
    }
    render();
    onChange({ start, end });
  }

  return {
    setUnavailable(ranges) {
      unavailable = ranges || [];
      render();
    },
    reset() {
      start = null;
      end = null;
      render();
    },
    getSelection() {
      return { start, end };
    },
    goToMonth(dateStr) {
      const d = new Date(dateStr + 'T00:00:00Z');
      viewMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      render();
    },
    /** Pre-select a range (e.g. from a deep link) only if it's actually free. Returns true on success. */
    trySelectRange(s, e) {
      if (!s || !e || isPast(s) || s >= e || !isRangeClean(s, e)) return false;
      start = s;
      end = e;
      this.goToMonth(s);
      return true;
    }
  };
}
