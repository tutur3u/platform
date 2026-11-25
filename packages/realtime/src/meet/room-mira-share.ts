import { z } from 'zod';
import type { MeetRealtimeTokenPayload } from './primitives';
import { MIRA_PRIVATE_NOTICE_VERSION } from './room-mira-private';
import type { RoomServiceState } from './room-service';

/** Shared tutor chat is dropped this long after its owner last sent it. */
export const MIRA_SHARE_CONTEXT_TTL_MS = 60 * 60_000;
export const MIRA_SHARE_MAX_TURNS = 12;
/** Encoded size cap for one person's shared tutor chat in room state. */
export const MIRA_SHARE_MAX_CONTEXT_BYTES = 16_000;

const sharedTurn = z.strictObject({
  assistant: z.boolean(),
  body: z.string().trim().min(1).max(2000),
});
export type MiraSharedTurn = z.infer<typeof sharedTurn>;

/**
 * One person's choice to let their own Private Mira read their private notes
 * and tutor chat in this meeting. It is bound to the Private Mira choice
 * revision it was made under, so muting or leaving Private Mira ends it.
 */
export type MiraShareGrant = {
  enabled: boolean;
  revision: number;
  choiceRevision: number;
  meetingId: string;
  updatedAt: number;
  context?: { tutor: MiraSharedTurn[]; updatedAt: number };
};
export type MiraShareState = Record<string, MiraShareGrant>;

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

export function applyMiraShare(
  state: RoomServiceState,
  token: MeetRealtimeTokenPayload,
  input: unknown,
  now = Date.now()
) {
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
    // Only the owner's own registered Private Mira session reads. Room Mira
    // sessions never carry the private scope or a private registration.
    if (
      !liveServer ||
      !token.scopes.includes('meet:private-mira') ||
      token.guest ||
      !active ||
      !state.miraPrivate?.sessions[account]?.includes(message.sessionId)
    )
      return fail();
    return {
      state,
      body: { tutor: freshContext(active, now)?.tutor ?? [] },
    };
  }

  // People set and read their own grant; Mira never changes it.
  if (liveServer || token.guest) return fail();
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
  if (message.action === 'mira.share.set' && !message.enabled) {
    // Revoking is always allowed and takes the shared context with it.
    if (!previous) return { state, body: view(null) };
    return save({
      enabled: false,
      revision: previous.revision + 1,
      choiceRevision: previous.choiceRevision,
      meetingId: previous.meetingId,
      updatedAt: now,
    });
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
  const context = { tutor: message.tutor, updatedAt: now };
  if (
    new TextEncoder().encode(JSON.stringify(context)).byteLength >
    MIRA_SHARE_MAX_CONTEXT_BYTES
  )
    return fail('Shared context is too large', 413);
  return save({ ...active, context });
}
