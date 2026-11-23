import { z } from 'zod';
import type { ActorLimitBuckets } from './actor-rate-limit';
import { liveActivityRequestIdSchema as requestId } from './live-activities-schema';
import { nextLiveActivityLimit } from './live-activity-rate';
import { canMeetRealtimeRunActivities } from './permissions';
import type { MeetRoomCommand, MeetRoomSnapshot } from './room';
import { denied, outcome } from './room-outcome';

/**
 * The one origin Meet opens, embeds or shares Upskii links on. Servers may
 * point it at a staging deployment with `resolveUpskiiOrigin`; the room never
 * takes a host from a message.
 */
export const UPSKII_ORIGIN = 'https://upskii.com';

/** Accepts an override only when it is a bare `https` origin. */
export function resolveUpskiiOrigin(override?: string | null): string {
  if (!override) return UPSKII_ORIGIN;
  try {
    const url = new URL(override);
    const bare =
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      `${url.origin}/` === url.href;
    return bare ? url.origin : UPSKII_ORIGIN;
  } catch {
    return UPSKII_ORIGIN;
  }
}

const MAX_URL_LENGTH = 2048;

/** A value that would send the browser to another site when followed. */
function pointsOffOrigin(value: string, origin: string) {
  const trimmed = value.trim();
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\\\\|\/\\)/i.test(trimmed)) {
    try {
      return new URL(trimmed, origin).origin !== origin;
    } catch {
      return true;
    }
  }
  return false;
}

/**
 * Returns the normalized link when it is `https` on exactly `origin`, with no
 * credentials and no parameter that redirects to another site; otherwise
 * null. `javascript:`, `data:`, lookalike hosts, other ports and open
 * redirects through Upskii are all dropped.
 */
export function toSafeUpskiiUrl(
  raw: unknown,
  origin: string = UPSKII_ORIGIN
): string | null {
  if (typeof raw !== 'string' || !raw || raw.length > MAX_URL_LENGTH)
    return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.origin !== origin) return null;
  if (url.username || url.password) return null;
  for (const [, value] of url.searchParams)
    if (pointsOffOrigin(value, origin)) return null;
  const hash = url.hash.slice(1);
  if (hash) {
    const params = new URLSearchParams(hash);
    for (const [, value] of params)
      if (pointsOffOrigin(value, origin)) return null;
  }
  return url.href;
}

const controlCharacters = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const label = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !controlCharacters.test(value), 'Invalid text');

export const UPSKII_PRESENTATION_KINDS = ['lesson', 'assessment'] as const;
export type UpskiiPresentationKind = (typeof UPSKII_PRESENTATION_KINDS)[number];

/** What a presenter shares: a label and a link, never lesson bodies or answers. */
export const upskiiPresentationItemSchema = z.object({
  kind: z.enum(UPSKII_PRESENTATION_KINDS),
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
  title: label(160),
  classTitle: label(120).optional(),
  url: z.string().max(MAX_URL_LENGTH),
});
export type UpskiiPresentationItem = z.infer<
  typeof upskiiPresentationItemSchema
>;

export type UpskiiPresentation = {
  item: UpskiiPresentationItem;
  presenterId: string;
  startedAt: string;
  revision: number;
};

export const upskiiPresentationClientMessages = [
  z.object({ type: z.literal('upskii.present.read'), requestId }),
  z.object({
    type: z.literal('upskii.present.set'),
    item: upskiiPresentationItemSchema,
    requestId,
  }),
  z.object({ type: z.literal('upskii.present.clear'), requestId }),
] as const;

export type UpskiiPresentationServerMessage = {
  type: 'upskii.presentation';
  presentation: UpskiiPresentation | null;
  requestId?: string;
};

declare module './room' {
  interface MeetRoomSnapshot {
    upskiiPresentation?: UpskiiPresentation;
    upskiiPresentationLimits?: ActorLimitBuckets;
  }
}

export const UPSKII_PRESENTATION_ACTIONS_PER_MINUTE = 30;

function snapshot(
  presentation: UpskiiPresentation | undefined,
  requestId?: string
): UpskiiPresentationServerMessage {
  return {
    type: 'upskii.presentation',
    presentation: presentation ?? null,
    ...(requestId ? { requestId } : {}),
  };
}

/**
 * The presented Upskii item. Anyone admitted may read it; only people who run
 * the room's activities may set or clear it. The link is checked against the
 * pinned origin again here, so a modified client cannot share another site.
 */
export function applyUpskiiPresentation(
  state: MeetRoomSnapshot,
  { message, token, now }: MeetRoomCommand
) {
  if (
    message.type !== 'upskii.present.read' &&
    message.type !== 'upskii.present.set' &&
    message.type !== 'upskii.present.clear'
  )
    return null;
  const { requestId } = message;
  const userId = token.userId;
  const timestamp = Date.parse(now);
  if (
    state.ended ||
    !state.presence[userId] ||
    state.waiting[userId] ||
    (state.budget && timestamp >= state.budget.expiresAt)
  )
    return denied(state, 'awaiting_admission', requestId);
  if (message.type === 'upskii.present.read')
    return outcome(state, {
      reply: [snapshot(state.upskiiPresentation, requestId)],
    });

  if (!canMeetRealtimeRunActivities(token))
    return denied(state, 'permission_denied', requestId);
  const limits = nextLiveActivityLimit(
    state.upskiiPresentationLimits,
    token.accountId ?? userId,
    timestamp,
    UPSKII_PRESENTATION_ACTIONS_PER_MINUTE
  );
  if (!limits) return denied(state, 'upskii_rate_limited', requestId);
  const revision = (state.upskiiPresentation?.revision ?? 0) + 1;

  let presentation: UpskiiPresentation | undefined;
  if (message.type === 'upskii.present.set') {
    const url = toSafeUpskiiUrl(message.item.url);
    if (!url) return denied(state, 'upskii_url_rejected', requestId);
    presentation = {
      item: { ...message.item, url },
      presenterId: userId,
      startedAt: now,
      revision,
    };
  } else if (!state.upskiiPresentation) {
    return outcome(state, { reply: [snapshot(undefined, requestId)] });
  }

  const event = snapshot(presentation);
  return outcome(
    {
      ...state,
      upskiiPresentation: presentation,
      upskiiPresentationLimits: limits,
    },
    {
      broadcast: [event],
      reply: requestId ? [snapshot(presentation, requestId)] : [],
    }
  );
}
