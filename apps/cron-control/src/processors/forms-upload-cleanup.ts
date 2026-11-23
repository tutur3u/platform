import { databaseHeaders } from '../database';
import { withinDeadline } from './deadline';
import { type PrivateRpcResult, postPrivateRpc } from './maintenance-rpc';
import type { ProcessorContext, ProcessorResult } from './types';

// Expired Forms respondent uploads for the Cloudflare schedule. Each page
// claims at most 20 reservations, deletes their storage objects in one call,
// then forgets the claimed rows in one call. The claim sets
// cleanup_started_at, and the storage.objects trigger refuses any write to a
// reservation whose cleanup has started, so an object deleted here cannot be
// written again. A slot that stops between steps leaves the rows claimed; the
// next claim takes them again and both deletes repeat safely.
//
// FORMS_UPLOAD_CLEANUP_MODE:
//   'delete'  bounded cleanup pages.
//   anything else (including unset and 'off') makes no call at all.

export const FORMS_UPLOAD_CLAIM_RPC = 'claim_expired_form_respondent_uploads';
export const FORMS_UPLOAD_BUCKET = 'forms-respondent-uploads';
/** Fixed by the claim function. */
export const FORMS_UPLOAD_CLAIM_LIMIT = 20;
export const FORMS_UPLOAD_MAX_PAGES = 4;
// One claimed row is about 200 bytes of JSON.
const CLAIM_RESPONSE_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

export type FormsUploadCleanupMode = 'delete' | 'off';

export function formsUploadCleanupMode(
  value: string | undefined
): FormsUploadCleanupMode {
  if (value === 'delete') return 'delete';
  if (value !== undefined && value !== 'off')
    console.warn('Forms upload cleanup invalid mode; disabled');
  return 'off';
}

export type ClaimedFormUpload = {
  id: string;
  ws_id: string;
  version_id: string;
  launch_id: string;
  question_id: string;
};

/** Must match formRespondentUploadKey in the Forms app. */
export function formUploadKey(row: ClaimedFormUpload) {
  return [
    row.ws_id,
    row.version_id,
    row.launch_id,
    row.question_id,
    row.id,
  ].join('/');
}

function claimedRow(value: unknown): ClaimedFormUpload | null {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  const fields = ['id', 'ws_id', 'version_id', 'launch_id', 'question_id'];
  if (
    fields.some(
      (field) => typeof row[field] !== 'string' || !UUID.test(row[field])
    )
  )
    return null;
  return {
    id: row.id as string,
    ws_id: row.ws_id as string,
    version_id: row.version_id as string,
    launch_id: row.launch_id as string,
    question_id: row.question_id as string,
  };
}

export interface FormsUploadCleanupDeps {
  /** Throws on network errors and on the run deadline. */
  claim: () => Promise<PrivateRpcResult>;
  /** Deletes the objects; a missing object counts as deleted. */
  remove: (keys: string[]) => Promise<boolean>;
  /** Deletes the claimed reservation rows. */
  forget: (ids: string[]) => Promise<boolean>;
  /** False once Cron Control stopped the job or its generation changed. */
  fence: () => Promise<boolean>;
  mode: FormsUploadCleanupMode;
}

export async function runFormsUploadCleanup(
  deps: FormsUploadCleanupDeps
): Promise<ProcessorResult> {
  const detail: Record<string, number> = { claimed: 0, removed: 0, pages: 0 };
  if (deps.mode === 'off') return { detail: { off: 1 }, outcome: 'ok' };

  for (let page = 0; page < FORMS_UPLOAD_MAX_PAGES; page++) {
    if (!(await deps.fence())) return { detail, outcome: 'stopped' };
    let claimed: PrivateRpcResult;
    try {
      claimed = await deps.claim();
    } catch {
      return { detail, outcome: 'unknown' };
    }
    if (claimed.kind === 'http') return { detail, outcome: 'failed' };
    if (
      claimed.kind !== 'ok' ||
      !Array.isArray(claimed.value) ||
      claimed.value.length > FORMS_UPLOAD_CLAIM_LIMIT
    )
      return { detail, outcome: 'unknown' };
    const rows = claimed.value.map(claimedRow);
    if (rows.some((row) => row === null)) return { detail, outcome: 'unknown' };
    if (!rows.length) break;
    detail.pages += 1;
    detail.claimed += rows.length;
    const uploads = rows as ClaimedFormUpload[];

    for (const step of [
      () => deps.remove(uploads.map(formUploadKey)),
      () => deps.forget(uploads.map(({ id }) => id)),
    ]) {
      if (!(await deps.fence())) return { detail, outcome: 'stopped' };
      let done: boolean;
      try {
        done = await step();
      } catch {
        return { detail, outcome: 'unknown' };
      }
      // A refused delete stays claimed and counts one attempt per slot, so
      // the claim function stops retrying it after five slots.
      if (!done) return { detail, outcome: 'failed' };
    }
    detail.removed += uploads.length;
    if (uploads.length < FORMS_UPLOAD_CLAIM_LIMIT) break;
    if (page + 1 === FORMS_UPLOAD_MAX_PAGES)
      return { detail: { ...detail, capped: 1 }, outcome: 'degraded' };
  }
  return { detail, outcome: 'ok' };
}

function authHeaders(key: string) {
  // Secret API keys authenticate through the gateway by `apikey` alone; legacy
  // JWT service keys must also be the bearer token.
  return {
    apikey: key,
    ...(key.startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }),
    'Content-Type': 'application/json',
  };
}

async function send(context: ProcessorContext, url: URL, init: RequestInit) {
  const timeout = AbortSignal.timeout(
    Math.max(1, Math.min(REQUEST_TIMEOUT_MS, context.deadline - context.now()))
  );
  const response = await withinDeadline(context, () =>
    context.fetch(url, {
      ...init,
      redirect: 'manual',
      signal: context.signal
        ? AbortSignal.any([context.signal, timeout])
        : timeout,
    })
  );
  void response.body?.cancel().catch(() => undefined);
  return response.ok;
}

/** Cron Control adapter: the service key claims, deletes and forgets. */
export function cleanupFormUploads(
  context: ProcessorContext
): Promise<ProcessorResult> {
  const { SUPABASE_SECRET_KEY: key, SUPABASE_URL: origin } = context.env;
  return runFormsUploadCleanup({
    mode: formsUploadCleanupMode(context.env.FORMS_UPLOAD_CLEANUP_MODE),
    fence: () => withinDeadline(context, context.fence),
    claim: () =>
      postPrivateRpc(
        context,
        FORMS_UPLOAD_CLAIM_RPC,
        { p_form_id: null, p_actor_scope: null },
        CLAIM_RESPONSE_BYTES
      ),
    remove: (keys) =>
      send(
        context,
        new URL(`/storage/v1/object/${FORMS_UPLOAD_BUCKET}`, origin),
        {
          method: 'DELETE',
          headers: authHeaders(key),
          body: JSON.stringify({ prefixes: keys }),
        }
      ),
    forget: (ids) => {
      const url = new URL('/rest/v1/form_respondent_uploads', origin);
      url.search = new URLSearchParams({
        id: `in.(${ids.join(',')})`,
        cleanup_started_at: 'not.is.null',
        ready_at: 'is.null',
        claimed_response_id: 'is.null',
      }).toString();
      return send(context, url, {
        method: 'DELETE',
        headers: { ...databaseHeaders(context.env), Prefer: 'return=minimal' },
      });
    },
  });
}
