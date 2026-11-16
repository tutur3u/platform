import { isValidTimezone } from '@tuturuuu/utils/timezone';

/**
 * Time zone for the dashboard's Finance month. Finance groups periods in the
 * workspace time zone (`workspace.timezone`). `auto` means the viewer's
 * browser zone, which a server render cannot read, so `auto`, unset and
 * invalid values use UTC.
 */
export function financePeriodTimeZone(workspaceTimeZone?: string | null) {
  return workspaceTimeZone &&
    workspaceTimeZone !== 'auto' &&
    isValidTimezone(workspaceTimeZone)
    ? workspaceTimeZone
    : 'UTC';
}

const partsFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

function zonedParts(instant: number, timeZone: string) {
  const parts = partsFormatter(timeZone).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/** Offset (ms) of `timeZone` from UTC at `instant`. */
function offsetAt(instant: number, timeZone: string) {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** UTC instant of local midnight on the first of `month0` in `timeZone`. */
function zonedMonthStart(year: number, month0: number, timeZone: string) {
  const wall = Date.UTC(year, month0, 1);
  // Two passes settle the offset across a DST change at the boundary.
  const first = wall - offsetAt(wall, timeZone);
  return wall - offsetAt(first, timeZone);
}

/**
 * The calendar month containing `now` in `timeZone`, as Finance's period
 * queries express it: from local midnight on the 1st to the last millisecond
 * before the next month.
 */
export function financeMonthRange(now: Date, timeZone: string) {
  const { year, month } = zonedParts(now.getTime(), timeZone);
  const start = zonedMonthStart(year, month - 1, timeZone);
  const next = zonedMonthStart(year, month, timeZone);
  return {
    start: new Date(start).toISOString(),
    end: new Date(next - 1).toISOString(),
  };
}

export interface FinanceRecentRow {
  id: string;
  label: string | null;
  /** Null when the route withheld a confidential amount. */
  amount: number | null;
  takenAt: string;
}

/** Narrows rows from the Finance transactions list route. */
export function toFinanceRecentRows(rows: unknown[]): FinanceRecentRow[] {
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const r = row as Record<string, unknown>;
    if (typeof r.id !== 'string' || typeof r.taken_at !== 'string') return [];
    const description = typeof r.description === 'string' ? r.description : null;
    const category = typeof r.category === 'string' ? r.category : null;
    return [
      {
        id: r.id,
        label: description?.trim() || category || null,
        amount:
          r.amount === null || r.amount === undefined || Number.isNaN(Number(r.amount))
            ? null
            : Number(r.amount),
        takenAt: r.taken_at,
      },
    ];
  });
}
