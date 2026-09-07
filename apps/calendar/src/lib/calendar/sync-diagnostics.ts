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
