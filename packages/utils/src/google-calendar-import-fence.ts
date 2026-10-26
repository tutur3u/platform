import type { calendar_v3 } from '@tuturuuu/google';
import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Json } from '@tuturuuu/types/db';
import { z } from 'zod';

const GOOGLE_ACCOUNT_PAGE = 200;
// Sanity bound on one workspace's active Google accounts.
const MAX_WORKSPACE_GOOGLE_ACCOUNTS = 10_000;

const CaptureSchema = z
  .object({
    id: z.guid(),
    wsId: z.guid(),
    calendarId: z.string().min(1),
    authTokenId: z.guid().nullable(),
  })
  .strict();
const ResultSchema = z
  .object({
    inserted: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative(),
    deferred: z.number().int().nonnegative(),
  })
  .strict();
export type GoogleImportCapture = z.infer<typeof CaptureSchema>;
export type GoogleImportResult = z.infer<typeof ResultSchema>;
export type GoogleImportScope = Omit<GoogleImportCapture, 'id'>;

export class GoogleImportFenceError extends Error {
  constructor() {
    super('Google import guard is unavailable; retry sync');
  }
}

/** Must run before any provider GET/list, including deferred replay reads. */
export async function captureGoogleImport(
  client: SupabaseClient,
  scope: GoogleImportScope
) {
  const { data, error } = await client.rpc('capture_calendar_google_import', {
    p_ws_id: scope.wsId,
    p_calendar_id: scope.calendarId,
    p_auth_token_id: scope.authTokenId,
  });
  const parsed = CaptureSchema.safeParse(data);
  if (
    error ||
    !parsed.success ||
    parsed.data.wsId !== scope.wsId ||
    parsed.data.calendarId !== scope.calendarId ||
    parsed.data.authTokenId !== scope.authTokenId
  )
    throw new GoogleImportFenceError();
  return parsed.data;
}

/** RPC commits applied rows and deferred identities together before token advance. */
export async function applyGoogleImport(
  client: SupabaseClient,
  capture: GoogleImportCapture,
  events: object[],
  tombstones: string[] = []
) {
  const { data, error } = await client.rpc('apply_calendar_google_import', {
    p_capture_id: capture.id,
    p_events: events as Json[],
    p_tombstones: tombstones,
  });
  const parsed = ResultSchema.safeParse(data);
  if (error || !parsed.success) throw new GoogleImportFenceError();
  return parsed.data;
}

function missingProviderEvent(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: unknown; response?: { status?: unknown } };
  return [404, 410].includes(Number(value.response?.status ?? value.code));
}

/** Only exact verified token-row scope may replay protected entries. Unknown
 * legacy account scope remains deferred; it never borrows a guessed account. */
export async function replayDeferredGoogleImports(args: {
  client: SupabaseClient;
  calendar: calendar_v3.Calendar;
  scope: GoogleImportScope;
  format: (events: calendar_v3.Schema$Event[]) => Promise<object[]>;
  syncDeletes?: boolean;
}) {
  const { data, error } = await args.client.rpc(
    'list_deferred_calendar_google_imports',
    {
      p_ws_id: args.scope.wsId,
      p_calendar_id: args.scope.calendarId,
      p_auth_token_id: args.scope.authTokenId,
    }
  );
  const parsed = z.array(z.string().min(1)).max(100).safeParse(data);
  if (error || !parsed.success) throw new GoogleImportFenceError();
  let deferred = 0;
  for (const id of parsed.data) {
    // Never apply the stored old snapshot. The queue stores identity only.
    const capture = await captureGoogleImport(args.client, args.scope);
    let providerEvent: calendar_v3.Schema$Event | null;
    try {
      const result = await args.calendar.events.get({
        calendarId: args.scope.calendarId,
        eventId: id,
      });
      if (result.data.id !== id) throw new GoogleImportFenceError();
      providerEvent = result.data.status === 'cancelled' ? null : result.data;
    } catch (failure) {
      if (!missingProviderEvent(failure)) throw failure;
      // Missing events and inaccessible/deleted calendars share 404/410. Only
      // confirmed access to this exact calendar can justify a local tombstone.
      try {
        const access = await args.calendar.calendarList.get({
          calendarId: args.scope.calendarId,
        });
        if (
          !['reader', 'writer', 'owner'].includes(
            access.data.accessRole ?? ''
          ) ||
          !access.data.id ||
          (args.scope.calendarId !== 'primary' &&
            access.data.id !== args.scope.calendarId)
        ) {
          deferred++;
          continue;
        }
      } catch {
        deferred++;
        continue;
      }
      providerEvent = null;
    }
    if (!providerEvent && args.syncDeletes === false) {
      deferred++;
      continue;
    }
    const result = await applyGoogleImport(
      args.client,
      capture,
      providerEvent ? await args.format([providerEvent]) : [],
      providerEvent ? [] : [id]
    );
    deferred += result.deferred;
  }
  return { deferred };
}

// Constant-time comparison so the match does not leak a credential prefix.
function sameCredential(stored: unknown, supplied: string) {
  if (typeof stored !== 'string' || stored.length !== supplied.length)
    return false;
  let difference = 0;
  for (let index = 0; index < stored.length; index += 1)
    difference |= stored.charCodeAt(index) ^ supplied.charCodeAt(index);
  return difference === 0;
}

/** Resolve a background caller's exact stored token row from its supplied
 * credential, without persisting or logging that credential. The credential
 * is compared in process; it never becomes a request filter, because
 * PostgREST filters travel in the URL. Ambiguity is null. */
export async function verifiedGoogleImportToken(
  client: SupabaseClient,
  wsId: string,
  accessToken: string
) {
  const matches: string[] = [];
  let scanned = 0;
  let after: string | null = null;
  // Keyset pages by id, so a large workspace is read in bounded chunks.
  for (;;) {
    let page = client
      .from('calendar_auth_tokens')
      .select('id, access_token')
      .eq('ws_id', wsId)
      .eq('provider', 'google')
      .eq('is_active', true);
    if (after) page = page.gt('id', after);
    const { data, error } = await page
      .order('id', { ascending: true })
      .limit(GOOGLE_ACCOUNT_PAGE);
    if (error) throw new GoogleImportFenceError();
    const rows = data ?? [];
    scanned += rows.length;
    if (scanned > MAX_WORKSPACE_GOOGLE_ACCOUNTS) {
      console.warn('Google import token scan exceeded its bound', {
        wsId,
        scanned,
      });
      throw new GoogleImportFenceError();
    }
    for (const row of rows)
      if (sameCredential(row.access_token, accessToken)) matches.push(row.id);
    if (rows.length < GOOGLE_ACCOUNT_PAGE) break;
    after = rows[rows.length - 1]?.id ?? null;
  }
  return matches.length === 1 ? z.guid().parse(matches[0]) : null;
}
