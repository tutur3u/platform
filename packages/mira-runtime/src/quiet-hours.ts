export interface QuietHours {
  /** Minutes after local midnight, 0-1439. */
  startMinute: number;
  endMinute: number;
  /** IANA time zone, e.g. Asia/Ho_Chi_Minh. */
  timeZone: string;
}

function assertMinute(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 1439) {
    throw new Error('Quiet hours minutes must be integers in 0-1439');
  }
}

export function localMinuteOfDay(nowMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(nowMs));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value);
  return hour * 60 + minute;
}

/** True inside the window; windows may cross midnight (22:30-07:00). */
export function isQuietTime(quiet: QuietHours | null, nowMs: number): boolean {
  if (!quiet) return false;
  assertMinute(quiet.startMinute);
  assertMinute(quiet.endMinute);
  if (quiet.startMinute === quiet.endMinute) return false;
  const minute = localMinuteOfDay(nowMs, quiet.timeZone);
  if (quiet.startMinute < quiet.endMinute) {
    return minute >= quiet.startMinute && minute < quiet.endMinute;
  }
  return minute >= quiet.startMinute || minute < quiet.endMinute;
}

/** Validates quiet hours when they are saved, so evaluation never throws. */
export function validateQuietHours(quiet: QuietHours): QuietHours {
  assertMinute(quiet.startMinute);
  assertMinute(quiet.endMinute);
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: quiet.timeZone });
  } catch {
    throw new Error('Invalid time zone');
  }
  return quiet;
}
