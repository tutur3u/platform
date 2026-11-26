import { buildJoinUrl } from '@tuturuuu/meet-core/features/call/lib/room-code';
import { personalWorkspace } from '@tuturuuu/meet-core/features/call/server/room-service';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { canVerifiedAccountHostMeeting } from '@tuturuuu/utils/meet-hosting';
import { sanitizeMeetingName } from '@tuturuuu/utils/meeting-name';
import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  canUserLinkUpskii,
  jsonNoStore,
  requireUpskiiAppCredentials,
} from '@/lib/integrations/upskii/access';
import {
  isUpskiiClassId,
  UPSKII_APP_ID,
} from '@/lib/integrations/upskii/constants';
import { auditLinkEvent } from '@/lib/integrations/upskii/link-service';
import {
  createExternalAccountLinkStore,
  type ExternalAccountLinkRow,
} from '@/lib/integrations/upskii/link-store';
import {
  initializeLiveClassRoom,
  isLiveClassRoomOpen,
} from '@/lib/integrations/upskii/live-class-meet';
import { liveClassStore } from '@/lib/integrations/upskii/live-class-store';
import {
  limitLiveClassStatus,
  limitVerifiedAccountLinkRequest,
} from '@/lib/integrations/upskii/rate-limit';
import { getMeetAppOrigin } from '@/lib/meet-app-url';

const linkIdentity = {
  linkId: z.uuid(),
  upskiiUserId: z.string().min(1).max(128),
};
const classId = z.string().refine(isUpskiiClassId);
const bodySchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('grant-status'), ...linkIdentity }),
  z.strictObject({ action: z.literal('status'), classId }),
  z.strictObject({
    action: z.literal('start'),
    ...linkIdentity,
    classId,
    name: z
      .string()
      .max(2048)
      .transform(sanitizeMeetingName)
      .pipe(z.string().min(1).max(255)),
  }),
]);
type Input = z.infer<typeof bodySchema>;

function refusal(code: string, status: number) {
  return jsonNoStore({ code }, { status });
}

async function activeLink(
  admin: TypedSupabaseClient,
  linkId: string,
  upskiiUserId: string
) {
  const link = await createExternalAccountLinkStore(admin).findById(linkId);
  return link && !link.revoked_at && link.external_subject === upskiiUserId
    ? link
    : null;
}

async function canHost(
  admin: TypedSupabaseClient,
  link: ExternalAccountLinkRow
) {
  if (
    !(await canUserLinkUpskii(admin, link.user_id, {
      upskiiEmail: link.external_email,
    }))
  )
    return false;
  const { data, error } = await admin.auth.admin.getUserById(link.user_id);
  if (error) throw new Error('Could not verify the Meet host account');
  return canVerifiedAccountHostMeeting(link.user_id, data.user);
}

async function statusForClass(admin: TypedSupabaseClient, id: string) {
  const limited = await limitLiveClassStatus(id);
  if (limited) return limited;
  const closed = () => jsonNoStore({ live: false });
  const store = liveClassStore(admin);
  const mapping = await store.findRoom(id);
  if (!mapping?.meeting_id) return closed();

  const link = await activeLink(admin, mapping.link_id, mapping.owner_subject);
  if (
    !link ||
    link.user_id !== mapping.owner_id ||
    !(await store.hasGrant(link.id)) ||
    !(await canHost(admin, link))
  )
    return closed();

  const { data: meeting, error } = await admin
    .from('workspace_meetings')
    .select('ws_id, creator_id')
    .eq('id', mapping.meeting_id)
    .maybeSingle();
  if (error) throw new Error('Could not verify the mapped Meet room');
  if (!meeting || meeting.creator_id !== link.user_id) return closed();

  const live = await isLiveClassRoomOpen({
    meetingId: mapping.meeting_id,
    userId: link.user_id,
    wsId: meeting.ws_id,
  });
  if (
    !live ||
    !(await activeLink(admin, link.id, mapping.owner_subject)) ||
    !(await store.hasGrant(link.id))
  )
    return closed();
  return jsonNoStore({
    live: true,
    hostLinkId: link.id,
    hostUpskiiUserId: link.external_subject,
    url: buildJoinUrl(getMeetAppOrigin(), mapping.meeting_id),
  });
}

async function linkedAction(
  admin: TypedSupabaseClient,
  input: Exclude<Input, { action: 'status' }>
) {
  const limited = await limitVerifiedAccountLinkRequest({
    appId: UPSKII_APP_ID,
    route: 'live-class',
    userId: input.upskiiUserId,
  });
  if (limited) return limited;

  const store = liveClassStore(admin);
  const link = await activeLink(admin, input.linkId, input.upskiiUserId);
  if (!link) return refusal('NOT_LINKED', 403);
  const entitled = await canHost(admin, link);
  const granted = await store.hasGrant(link.id);
  if (input.action === 'grant-status')
    return jsonNoStore({ granted, entitled });
  if (!entitled) return refusal('HOSTING_UNAVAILABLE', 403);
  if (!granted) return refusal('GRANT_REQUIRED', 403);

  const wsId = await personalWorkspace(link.user_id);
  const result = await store.openRoom({
    p_class_id: input.classId,
    p_link_id: link.id,
    p_name: input.name,
    p_owner_id: link.user_id,
    p_subject: link.external_subject,
    p_ws_id: wsId,
  });
  if (result.kind === 'conflict') return refusal('CLASS_OWNER_CONFLICT', 409);
  if (result.kind === 'denied') return refusal('START_DENIED', 403);

  if (
    !(await activeLink(admin, link.id, link.external_subject)) ||
    !(await store.hasGrant(link.id))
  )
    return refusal('START_DENIED', 403);

  const ready = await initializeLiveClassRoom({
    meetingId: result.meetingId,
    userId: link.user_id,
    wsId,
  });
  if (!ready) return refusal('ROOM_CLOSED', 409);
  if (
    !(await activeLink(admin, link.id, link.external_subject)) ||
    !(await store.hasGrant(link.id))
  )
    return refusal('START_DENIED', 403);

  auditLinkEvent('meet-room-opened', { linkId: link.id, userId: link.user_id });
  return jsonNoStore({
    roomId: result.meetingId,
    url: buildJoinUrl(getMeetAppOrigin(), result.meetingId),
  });
}

async function readLiveClassBody(request: NextRequest): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 2000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (timedOut) return null;
      if (done) return JSON.parse(text + decoder.decode());
      bytes += value.byteLength;
      if (bytes > 16_384) {
        void reader.cancel().catch(() => undefined);
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
}

export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await readLiveClassBody(request));
  const route =
    parsed.success && parsed.data.action === 'status'
      ? 'live-class-status'
      : 'live-class';
  const auth = await requireUpskiiAppCredentials(request, route);
  if (!auth.ok) return auth.response;
  if (!parsed.success) return refusal('INVALID_REQUEST', 400);
  try {
    return await (parsed.data.action === 'status'
      ? statusForClass(auth.admin, parsed.data.classId)
      : linkedAction(auth.admin, parsed.data));
  } catch (error) {
    console.error('Upskii live class request failed', {
      action: parsed.data.action,
      name: error instanceof Error ? error.name : 'unknown',
    });
    return refusal('LIVE_CLASS_UNAVAILABLE', 503);
  }
}
