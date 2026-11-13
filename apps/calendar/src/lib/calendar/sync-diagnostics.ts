import { z } from 'zod';

// Store only safe connection identifiers and classified errors in the existing
// diagnostic text field. Never persist provider payloads, headers, or tokens.
export const syncFailureSchema = z.object({
  connectionId: z.string(),
  calendarName: z.string(),
  code: z.string(),
});
export type CalendarSyncFailure = z.infer<typeof syncFailureSchema>;
const diagnosticsSchema = z.object({
  version: z.literal(1),
  failedCalendars: z.array(syncFailureSchema),
});
export function readSyncFailures(
  value: string | null | undefined
): CalendarSyncFailure[] {
  try {
    const result = diagnosticsSchema.safeParse(JSON.parse(value || 'null'));
    return result.success ? result.data.failedCalendars : [];
  } catch {
    return [];
  }
}

// The strict text-field trigger rejects a write above the column limit, which
// would fail the whole run record, so stored diagnostics stay well under it.
export const SYNC_DIAGNOSTICS_MAX_CHARS = 900;
const SYNC_ERROR_MESSAGE_MAX_CHARS = 500;
const CALENDAR_NAME_MAX_CHARS = 80;

export function serializeSyncFailures(
  failures: readonly CalendarSyncFailure[]
): string {
  const kept: CalendarSyncFailure[] = [];
  for (const failure of failures) {
    const next = [
      ...kept,
      {
        connectionId: failure.connectionId,
        calendarName: String(failure.calendarName ?? '').slice(
          0,
          CALENDAR_NAME_MAX_CHARS
        ),
        code: failure.code,
      },
    ];
    const text = JSON.stringify({ version: 1, failedCalendars: next });
    if (text.length > SYNC_DIAGNOSTICS_MAX_CHARS) break;
    kept.push(next[next.length - 1] as CalendarSyncFailure);
  }
  return JSON.stringify({ version: 1, failedCalendars: kept });
}

const REDACTIONS: Array<[RegExp, string]> = [
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]'],
  [/\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '[redacted]'],
  [/\bya29\.[A-Za-z0-9._-]+/g, '[redacted]'],
  [/\b1\/\/[A-Za-z0-9._-]{20,}/g, '[redacted]'],
  [
    /\b(access_token|refresh_token|id_token|client_secret|code|authorization|apikey|api_key|token|password|secret)(["']?\s*[:=]\s*)(["']?)[^\s"'&,;}]+/gi,
    '$1$2$3[redacted]',
  ],
  [/(https?:\/\/[^\s"'<>?#]+)[?#][^\s"'<>]*/gi, '$1'],
];

// Provider and driver messages can carry tokens, authorization headers, OAuth
// codes or request URLs with query secrets; redact them and cap the length
// before the message is stored or returned.
export function sanitizeSyncErrorMessage(message: string): string {
  let text = message;
  for (const [pattern, replacement] of REDACTIONS)
    text = text.replace(pattern, replacement);
  return text.length > SYNC_ERROR_MESSAGE_MAX_CHARS
    ? `${text.slice(0, SYNC_ERROR_MESSAGE_MAX_CHARS)}...`
    : text;
}
