/**
 * Cell value normalizers for the teacher schedule import. All functions are
 * pure and return null for values they cannot interpret.
 */

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const DAY_MS = 86_400_000;
const MINUTES_PER_DAY = 24 * 60;

const AM_MARKERS = new Set(['am', 'a m', 'sa', 'sang']);
const PM_MARKERS = new Set(['pm', 'p m', 'ch', 'chieu', 'toi']);

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function toIsoDate(year: number, month: number, day: number) {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) {
    return null;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

function normalizeYear(raw: string | undefined, referenceYear?: number) {
  if (!raw) return referenceYear ?? null;
  const year = Number.parseInt(raw, 10);
  return raw.length === 2 ? 2000 + year : year;
}

/**
 * Accepts an Excel date serial, a `Date`, ISO `YYYY-MM-DD`, or a day-first
 * `D/M/YYYY`, `D-M-YY`, `D.M` (year from `referenceYear`) string.
 */
export function normalizeScheduleDate(
  value: unknown,
  referenceYear?: number
): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return toIsoDate(
      value.getFullYear(),
      value.getMonth() + 1,
      value.getDate()
    );
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 1) return null;
    const date = new Date(EXCEL_EPOCH_UTC + Math.floor(value) * DAY_MS);
    return toIsoDate(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate()
    );
  }

  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/u);
  if (iso) {
    return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  // Day-first, optionally prefixed by a weekday label ("Mon 5/10").
  const dayFirst = text.match(
    /(?:^|\s)(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/u
  );
  if (!dayFirst) return null;

  const year = normalizeYear(dayFirst[3], referenceYear);
  if (year === null) return null;
  return toIsoDate(year, Number(dayFirst[2]), Number(dayFirst[1]));
}

function normalizeMeridiem(value: string) {
  const key = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replace(/[^a-z]+/gu, ' ')
    .trim();
  if (AM_MARKERS.has(key)) return 'AM';
  if (PM_MARKERS.has(key)) return 'PM';
  return key ? 'invalid' : null;
}

function formatTime(hour: number, minute: number, meridiem: string | null) {
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (minute < 0 || minute > 59) return null;

  if (meridiem === 'invalid') return null;
  if (meridiem) {
    // A 24-hour value with a matching PM marker is still unambiguous.
    if (meridiem === 'PM' && hour >= 13 && hour <= 23) {
      return `${pad(hour)}:${pad(minute)}`;
    }
    if (hour < 1 || hour > 12) return null;
    const hour24 = meridiem === 'PM' ? (hour % 12) + 12 : hour % 12;
    return `${pad(hour24)}:${pad(minute)}`;
  }

  if (hour < 0 || hour > 23) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

/**
 * Joins a TIME cell and an optional AM/PM cell into 24-hour `HH:MM`.
 *
 * Accepts `5:30`, `5.30`, `5h30`, `5`, `5:30 PM`, `17:30`, an Excel time
 * fraction (`0.729…`), or a number typed as `5.3` (read as 5:30).
 */
export function normalizeScheduleTime(
  value: unknown,
  meridiemValue = ''
): string | null {
  let meridiem = normalizeMeridiem(meridiemValue);

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null;
    if (value < 1) {
      const minutes = Math.round(value * MINUTES_PER_DAY) % MINUTES_PER_DAY;
      return formatTime(Math.floor(minutes / 60), minutes % 60, meridiem);
    }
    const hour = Math.floor(value);
    const minute = Math.round((value - hour) * 100);
    return formatTime(hour, minute, meridiem);
  }

  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;

  const match = text.match(
    /^(\d{1,2})(?:\s*[:.hH]\s*(\d{1,2})?)?(?::\d{2})?\s*([a-zA-Z. ]*)$/u
  );
  if (!match) return null;

  const inlineMeridiem = match[3]?.trim();
  if (inlineMeridiem) {
    const inline = normalizeMeridiem(inlineMeridiem);
    if (meridiem && inline !== meridiem) return null;
    meridiem = inline;
  }

  const minuteText = match[2] ?? '0';
  const minute =
    minuteText.length === 1
      ? Number(minuteText) * 10
      : Number.parseInt(minuteText, 10);
  return formatTime(Number.parseInt(match[1] ?? '', 10), minute, meridiem);
}

/** Returns `start + minutes` as `HH:MM`, or null if it passes midnight. */
export function addMinutesToTime(start: string, minutes: number) {
  const match = start.match(/^(\d{2}):(\d{2})$/u);
  if (!match || !Number.isFinite(minutes) || minutes <= 0) return null;

  const total = Number(match[1]) * 60 + Number(match[2]) + Math.round(minutes);
  if (total >= MINUTES_PER_DAY) return null;
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

export function isIsoDate(value: string | undefined) {
  return !!value && normalizeScheduleDate(value) === value;
}
