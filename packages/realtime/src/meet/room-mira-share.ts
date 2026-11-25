import { z } from 'zod';
import type { MeetRealtimeTokenPayload } from './primitives';
import { MIRA_PRIVATE_NOTICE_VERSION } from './room-mira-private';
import type { RoomServiceState } from './room-service';

/** Shared tutor chat is dropped this long after its owner last sent it. */
export const MIRA_SHARE_CONTEXT_TTL_MS = 60 * 60_000;
export const MIRA_SHARE_MAX_TURNS = 12;
/** Encoded size cap for one person's shared tutor chat. */
export const MIRA_SHARE_MAX_CONTEXT_BYTES = 16_000;
/** Cap across everyone's shared tutor chat in one room; oldest goes first. */
export const MIRA_SHARE_TOTAL_CONTEXT_BYTES = 256_000;
/** Each person's shared tutor chat lives under its own storage key. */
export const MIRA_SHARE_CONTEXT_KEY_PREFIX = 'mira-share:';
export const miraShareContextKey = (account: string) =>
  `${MIRA_SHARE_CONTEXT_KEY_PREFIX}${account}`;

const sharedTurn = z.strictObject({
  assistant: z.boolean(),
  body: z.string().trim().min(1).max(2000),
});
export type MiraSharedTurn = z.infer<typeof sharedTurn>;

/** The stored tutor chat, bound to the grant revision it was shared under. */
export type MiraShareStoredContext = {
  tutor: MiraSharedTurn[];
  updatedAt: number;
  revision: number;
};

/**
 * One person's choice to let their own Private Mira read their tutor chat in
 * this meeting. It is bound to the Private Mira choice revision it was made
 * under, so muting or leaving Private Mira ends it. The room snapshot keeps
 * only metadata about the shared chat; its text lives under its own key.
 */
export type MiraShareGrant = {
  enabled: boolean;
  revision: number;
  choiceRevision: number;
  meetingId: string;
  updatedAt: number;
  context?: { updatedAt: number; bytes: number };
};
export type MiraShareState = Record<string, MiraShareGrant>;
/** Tutor chat waiting for the room's next storage write; never persisted. */
export type MiraSharePending = Record<string, MiraShareStoredContext>;

/**
 * Every command acts on the caller's own grant. The strict schemas reject an
 * account field, so a host can never grant or read another person's data.
 */
const command = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('mira.share.read') }),
  z.strictObject({
    action: z.literal('mira.share.set'),
    enabled: z.boolean(),
  }),
  z.strictObject({
    action: z.literal('mira.share.context'),
    tutor: z.array(sharedTurn).max(MIRA_SHARE_MAX_TURNS),
  }),
  z.strictObject({
    action: z.literal('mira.share.private.read'),
    sessionId: z.uuid(),
  }),
]);

function continuingRevision(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  account: string
) {
  const choice = state.miraPrivate?.choices[account];
  return choice?.choice === 'continue' &&
    choice.version === MIRA_PRIVATE_NOTICE_VERSION &&
    choice.accountId === account &&
    choice.meetingId === token.meetingId
    ? choice.revision
    : null;
}

/** A grant counts only while its Private Mira choice revision still holds. */
export function activeMiraShare(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  account: string
) {
  const grant = state.miraShares?.[account];
  const revision = continuingRevision(state, token, account);
  return grant?.enabled === true &&
    !state.ended &&
    revision !== null &&
    grant.choiceRevision === revision &&
    grant.meetingId === token.meetingId
    ? grant
    : null;
}

function freshContext(grant: MiraShareGrant | null, now: number) {
  const context = grant?.context;
  return context && context.updatedAt + MIRA_SHARE_CONTEXT_TTL_MS > now
    ? context
    : null;
}

/** When the next shared tutor chat expires, so the room can sweep it. */
export function nextMiraShareExpiry(state: RoomServiceState) {
  let next: number | undefined;
  for (const grant of Object.values(state.miraShares ?? {})) {
    if (!grant.context) continue;
    const at = grant.context.updatedAt + MIRA_SHARE_CONTEXT_TTL_MS;
    if (next === undefined || at < next) next = at;
  }
  return next;
}

/** Whether a stored grant still holds, without a caller's token. */
function grantHolds(
  state: RoomServiceState,
  account: string,
  grant: MiraShareGrant
) {
  const choice = state.miraPrivate?.choices[account];
  return (
    grant.enabled &&
    !state.ended &&
    choice?.choice === 'continue' &&
    choice.version === MIRA_PRIVATE_NOTICE_VERSION &&
    choice.accountId === account &&
    choice.meetingId === grant.meetingId &&
    choice.revision === grant.choiceRevision
  );
}

/**
 * Drops shared tutor chat that has expired or whose grant no longer holds
 * (revoked, or the Private Mira choice changed). Returns the same object when
 * nothing changes, so callers persist only real drops.
 */
export function pruneMiraShares<T extends RoomServiceState>(
  state: T,
  now = Date.now()
): T {
  const shares = state.miraShares;
  if (!shares) return state;
  let changed = false;
  const next: MiraShareState = {};
  for (const [account, grant] of Object.entries(shares)) {
    if (
      grant.context &&
      (!grantHolds(state, account, grant) || !freshContext(grant, now))
    ) {
      const { context: _dropped, ...kept } = grant;
      next[account] = kept;
      changed = true;
    } else next[account] = grant;
  }
  return changed ? { ...state, miraShares: next } : state;
}

/** Subject or meeting erasure removes the grant and anything it shared. */
export function eraseMiraShares<T extends RoomServiceState>(
  state: T,
  target: { all?: boolean; userId?: string }
): T {
  const shares = state.miraShares;
  if (!shares) return state;
  if (target.all)
    return { ...state, miraShares: undefined, miraSharePending: undefined };
  if (!target.userId || !shares[target.userId]) return state;
  const { [target.userId]: _erased, ...kept } = shares;
  const { [target.userId]: _text, ...pending } = state.miraSharePending ?? {};
  return { ...state, miraShares: kept, miraSharePending: pending };
}

/** Adds the caller's own share status to their Private Mira choice read. */
export function withMiraShareStatus<
  R extends { state: RoomServiceState; body: unknown; status?: number },
>(result: R, token: MeetRealtimeTokenPayload, input: unknown): R {
  if (
    result.status ||
    !input ||
    typeof input !== 'object' ||
    (input as { action?: unknown }).action !== 'mira.private.read' ||
    !result.body ||
    typeof result.body !== 'object'
  )
    return result;
  const account = token.accountId ?? token.userId;
  return {
    ...result,
    body: {
      ...result.body,
      shared: !!activeMiraShare(result.state, token, account),
    },
  };
}

export function applyMiraShare(
  snapshot: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  now = Date.now()
) {
  const state = pruneMiraShares(snapshot, now);
  const parsed = command.safeParse(input);
  if (!parsed.success) {
    const action =
      input && typeof input === 'object' && 'action' in input
        ? String((input as { action: unknown }).action)
        : '';
    return action.startsWith('mira.share.')
      ? { state, body: { error: 'Invalid share request' }, status: 400 }
      : null;
  }
  const message = parsed.data;
  const account = token.accountId ?? token.userId;
  const fail = (
    error = 'Private Mira sharing is unavailable',
    status = 403
  ) => ({
    state,
    body: { error },
    status,
  });
  const liveServer = token.scopes.includes('meet:live-server');
  const active = activeMiraShare(state, token, account);
  const view = (grant: MiraShareGrant | null) => ({
    enabled: !!grant,
    revision: state.miraShares?.[account]?.revision ?? 0,
  });

  if (message.action === 'mira.share.private.read') {
    const read = authorizeMiraSharePrivateRead(state, token, message, now);
    // The text lives in room storage, which the Durable Object reads.
    return 'status' in read
      ? read
      : fail('Shared tutor chat is read from room storage', 503);
  }

  const privateMira = token.scopes.includes('meet:private-mira');
  const revoking = message.action === 'mira.share.set' && !message.enabled;
  // People set and read their own grant. Mira never turns one on; only the
  // owner's own Private Mira may revoke it for them, e.g. on a withdrawal.
  if (token.guest || (liveServer && !(revoking && privateMira))) return fail();
  // Only the app server, after its own account confirmation and flag checks,
  // may read, turn on or fill a share. Revoking stays open to the owner.
  const serverIssued = token.scopes.includes('meet:server');
  if (!serverIssued && !revoking) return fail();
  const admitted = Object.values(state.presence).some(
    (person) => (person.accountId ?? person.userId) === account
  );
  if (message.action === 'mira.share.read')
    return admitted ? { state, body: view(active) } : fail();

  const previous = state.miraShares?.[account];
  const save = (grant: MiraShareGrant) => ({
    state: { ...state, miraShares: { ...state.miraShares, [account]: grant } },
    body: { enabled: grant.enabled, revision: grant.revision },
  });
  if (revoking) {
    // Revoking is always allowed and takes the shared context with it. It
    // returns the owner's registered Private Mira sessions, admitted or not,
    // so the caller can end every session that may have read it.
    const sessions = state.miraPrivate?.sessions[account] ?? [];
    if (!previous) return { state, body: { ...view(null), sessions } };
    const revoked = save({
      enabled: false,
      revision: previous.revision + 1,
      choiceRevision: previous.choiceRevision,
      meetingId: previous.meetingId,
      updatedAt: now,
    });
    return { ...revoked, body: { ...revoked.body, sessions } };
  }
  if (!admitted || state.ended) return fail('Join an active meeting first');
  if (message.action === 'mira.share.set') {
    const choiceRevision = continuingRevision(state, token, account);
    if (choiceRevision === null)
      return fail('Choose Continue with Mira before sharing');
    if (active) return { state, body: view(active) };
    return save({
      enabled: true,
      revision: (previous?.revision ?? 0) + 1,
      choiceRevision,
      meetingId: token.meetingId ?? '',
      updatedAt: now,
    });
  }
  if (!active) return fail();
  const stored: MiraShareStoredContext = {
    tutor: message.tutor,
    updatedAt: now,
    revision: active.revision,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(stored)).byteLength;
  if (bytes > MIRA_SHARE_MAX_CONTEXT_BYTES)
    return fail('Shared context is too large', 413);
  const shares = evictForRoom(state.miraShares ?? {}, account, bytes);
  return {
    state: {
      ...state,
      miraShares: {
        ...shares,
        [account]: { ...active, context: { updatedAt: now, bytes } },
      },
      miraSharePending: { ...state.miraSharePending, [account]: stored },
    },
    body: { enabled: true, revision: active.revision },
  };
}

/** Drops the oldest other shared chats until this one fits the room cap. */
function evictForRoom(
  shares: MiraShareState,
  account: string,
  bytes: number
): MiraShareState {
  const others = Object.entries(shares)
    .filter(([id, grant]) => id !== account && grant.context)
    .sort(([, a], [, b]) => a.context!.updatedAt - b.context!.updatedAt);
  let total = others.reduce(
    (sum, [, grant]) => sum + grant.context!.bytes,
    bytes
  );
  const next = { ...shares };
  for (const [id, grant] of others) {
    if (total <= MIRA_SHARE_TOTAL_CONTEXT_BYTES) break;
    const { context: _evicted, ...kept } = grant;
    next[id] = kept;
    total -= grant.context!.bytes;
  }
  return next;
}

/**
 * Checks a Private Mira read of shared tutor chat. Only the owner's own
 * registered Private Mira session reads; Room Mira sessions never carry the
 * private scope or a private registration. Returns the grant to read under.
 */
export function authorizeMiraSharePrivateRead(
  snapshot: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  now = Date.now()
):
  | { state: RoomServiceState; body: { error: string }; status: number }
  | { account: string; grant: MiraShareGrant } {
  const state = pruneMiraShares(snapshot, now);
  const parsed = command.safeParse(input);
  const account = token.accountId ?? token.userId;
  const active = activeMiraShare(state, token, account);
  if (
    !parsed.success ||
    parsed.data.action !== 'mira.share.private.read' ||
    !token.scopes.includes('meet:server') ||
    !token.scopes.includes('meet:live-server') ||
    !token.scopes.includes('meet:private-mira') ||
    token.guest ||
    !active ||
    !state.miraPrivate?.sessions[account]?.includes(parsed.data.sessionId)
  )
    return {
      state,
      body: { error: 'Private Mira sharing is unavailable' },
      status: 403,
    };
  return { account, grant: active };
}
