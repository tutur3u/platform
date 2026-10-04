import 'server-only';
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
  const token = signRealtimePayload(
    {
      aud: 'tuturuuu.playground-preview',
      ownerId: input.ownerId,
      projectId: input.projectId,
      port: input.port,
      meetingId: input.meetingId,
      roomId: input.roomId,
      exp: Math.floor(Date.now() / 1000) + 60,
    },
    process.env.MEET_REALTIME_TOKEN_SECRET
  );
  return `${input.prefix}${PREVIEW_CAPABILITY_SEGMENT}/${token}/`;
}

/** An opaque iframe cannot attach platform cookies to module requests. This
 * capability authorizes GET assets for one project/port without account tokens. */
export function readPreviewCapability(
  token: string,
  expected: { port: number; projectId?: string; roomId?: string }
) {
  const parsed = PlaygroundPreviewCapability.safeParse(
    verifyRealtimePayload(token, process.env.MEET_REALTIME_TOKEN_SECRET)
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
  return parsed.data;
}
