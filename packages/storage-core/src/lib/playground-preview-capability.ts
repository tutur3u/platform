import 'server-only';
import {
  openPreviewOwner,
  sealPreviewOwner,
} from '@tuturuuu/realtime/core/opaque-ids';
import {
  signRealtimePayload,
  verifyRealtimePayload,
} from '@tuturuuu/realtime/core/token';
import { PlaygroundPreviewCapability } from '@tuturuuu/utils/playground-schema';

export const PREVIEW_CAPABILITY_SEGMENT = '_ttr-preview';
export function previewCapabilityPrefix(input: {
  ownerId: string;
  projectId: string;
  port: number;
  prefix: string;
  meetingId?: string;
  roomId?: string;
}) {
  // Native previews already have a separate loopback capability and authenticated proxy.
  if (
    !input.prefix.startsWith('/') ||
    input.prefix.includes(`/${PREVIEW_CAPABILITY_SEGMENT}/`)
  )
    return input.prefix;
  const secret = process.env.MEET_REALTIME_TOKEN_SECRET;
  // The capability sits in URLs the browser reads, and a Meet viewer may be
  // outside the workspace, so the owner travels sealed.
  const token = signRealtimePayload(
    {
      aud: 'tuturuuu.playground-preview',
      ownerSeal: sealPreviewOwner(secret, input, input.ownerId),
      projectId: input.projectId,
      port: input.port,
      meetingId: input.meetingId,
      roomId: input.roomId,
      exp: Math.floor(Date.now() / 1000) + 60,
    },
    secret
  );
  return `${input.prefix}${PREVIEW_CAPABILITY_SEGMENT}/${token}/`;
}

/** An opaque iframe cannot attach platform cookies to module requests. This
 * capability authorizes GET assets for one project/port without account tokens. */
export function readPreviewCapability(
  token: string,
  expected: { port: number; projectId?: string; roomId?: string }
) {
  const secret = process.env.MEET_REALTIME_TOKEN_SECRET;
  const parsed = PlaygroundPreviewCapability.safeParse(
    verifyRealtimePayload(token, secret)
  );
  if (
    !parsed.success ||
    parsed.data.exp * 1000 <= Date.now() ||
    parsed.data.exp > Math.floor(Date.now() / 1000) + 60 ||
    parsed.data.port !== expected.port ||
    parsed.data.roomId !== expected.roomId ||
    (expected.projectId && parsed.data.projectId !== expected.projectId)
  )
    throw new Error('Invalid preview capability');
  const { ownerSeal, ...scope } = parsed.data;
  const ownerId = ownerSeal
    ? openPreviewOwner(secret, scope, ownerSeal)
    : scope.ownerId;
  if (!ownerId) throw new Error('Invalid preview capability');
  return { ...scope, ownerId };
}
