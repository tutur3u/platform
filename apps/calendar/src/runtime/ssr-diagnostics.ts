export const CALENDAR_SSR_MARKER = 'calendar-ssr-diagnostic ';
export const errorNames = [
  'Error',
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'RangeError',
  'UNKNOWN',
] as const;
export const errorCodes = [
  'ERR_MODULE_NOT_FOUND',
  'ERR_INVALID_URL',
  'ERR_INVALID_ARG_TYPE',
  'ERR_ASSERTION',
  'ERR_REQUIRE_ESM',
  'UNKNOWN',
] as const;
export const errorCategories = [
  'TYPE_ERROR',
  'REFERENCE_ERROR',
  'SYNTAX_ERROR',
  'RANGE_ERROR',
  'MODULE_RESOLUTION',
  'UNKNOWN',
] as const;
export const frameFunctions = [
  'handleCalendarRequest',
  'dispatchCalendarRequest',
  'dispatchThroughCalendarProxy',
  'loadPageModel',
  'loadResolvedPageModel',
  'loadLocaleContext',
  'getLocale',
  'getTranslations',
  'createTranslator',
  'CalendarError',
  'Document',
  'AppProviders',
  'TokenVerifier',
  'TokenVerifierCore',
] as const;
export type CalendarErrorPhase = 'handler' | 'render-boundary';
const allowed = <T extends string>(
  value: unknown,
  values: readonly T[]
): T | 'UNKNOWN' => values.find((entry) => entry === value) ?? 'UNKNOWN';
const integer = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= 1_000_000;
function object(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}
function keys(value: Record<string, unknown>, expected: string[]) {
  return Object.keys(value).sort().join(',') === expected.sort().join(',');
}
export function projectCalendarSsrError(
  error: unknown,
  phase: CalendarErrorPhase
) {
  let name: (typeof errorNames)[number] = 'UNKNOWN';
  let code: (typeof errorCodes)[number] = 'UNKNOWN';
  const frames: {
    function: (typeof frameFunctions)[number];
    line: number;
    column: number;
  }[] = [];
  try {
    if (error && typeof error === 'object') {
      if ('name' in error) name = allowed(error.name, errorNames);
      if ('code' in error) code = allowed(error.code, errorCodes);
      if ('stack' in error && typeof error.stack === 'string') {
        for (const line of error.stack
          .slice(0, 4096)
          .split('\n')
          .slice(1, 17)) {
          const match =
            /^\s*at (?:async )?(?:Object\.)?([A-Za-z]+) \([^\n]*:(\d+):(\d+)\)\s*$/.exec(
              line
            );
          if (!match) continue;
          const fn = frameFunctions.find((value) => value === match[1]);
          const row = Number(match[2]),
            column = Number(match[3]);
          if (fn && integer(row) && integer(column))
            frames.push({ function: fn, line: row, column });
          if (frames.length === 4) break;
        }
      }
    }
  } catch {
    name = 'UNKNOWN';
    code = 'UNKNOWN';
    frames.length = 0;
  }
  const category: (typeof errorCategories)[number] =
    code === 'ERR_MODULE_NOT_FOUND' || code === 'ERR_REQUIRE_ESM'
      ? 'MODULE_RESOLUTION'
      : name === 'TypeError'
        ? 'TYPE_ERROR'
        : name === 'ReferenceError'
          ? 'REFERENCE_ERROR'
          : name === 'SyntaxError'
            ? 'SYNTAX_ERROR'
            : name === 'RangeError'
              ? 'RANGE_ERROR'
              : 'UNKNOWN';
  return { version: 1, phase, name, code, category, frames };
}
export type CalendarSsrErrorRecord = ReturnType<typeof projectCalendarSsrError>;
export function parseCalendarSsrErrorRecord(
  value: unknown
): CalendarSsrErrorRecord | undefined {
  if (
    !object(value) ||
    !keys(value, ['version', 'phase', 'name', 'code', 'category', 'frames']) ||
    value.version !== 1 ||
    (value.phase !== 'handler' && value.phase !== 'render-boundary')
  )
    return;
  const name = errorNames.find((entry) => entry === value.name),
    code = errorCodes.find((entry) => entry === value.code),
    category = errorCategories.find((entry) => entry === value.category);
  if (
    !name ||
    !code ||
    !category ||
    !Array.isArray(value.frames) ||
    value.frames.length > 4
  )
    return;
  const frames: CalendarSsrErrorRecord['frames'] = [];
  for (const frame of value.frames) {
    if (
      !object(frame) ||
      !keys(frame, ['function', 'line', 'column']) ||
      !integer(frame.line) ||
      !integer(frame.column)
    )
      return;
    const fn = frameFunctions.find((entry) => entry === frame.function);
    if (!fn) return;
    frames.push({ function: fn, line: frame.line, column: frame.column });
  }
  return { version: 1, phase: value.phase, name, code, category, frames };
}
let reported = 0;
export function reportCalendarSsrError(
  error: unknown,
  phase: CalendarErrorPhase
) {
  // This cap is per Worker instance, including repeated render-boundary failures.
  if (reported >= 16) return;
  reported += 1;
  try {
    const record = projectCalendarSsrError(error, phase);
    console.error(`calendar-ssr-error category=${record.category}`);
    if (
      typeof process !== 'undefined' &&
      process.env.CALENDAR_SSR_DIAGNOSTICS === 'fixture-v1'
    )
      console.error(`${CALENDAR_SSR_MARKER}${JSON.stringify(record)}`);
  } catch {
    /* Diagnostics must never replace the owning error or fallback. */
  }
}
