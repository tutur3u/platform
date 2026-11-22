import 'server-only';
import { WorkspaceStorageError } from '@tuturuuu/storage-core/workspace-storage-provider';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { AccountServiceError } from '@tuturuuu/utils/account-benefits-server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { getMeetCallAccess, MeetCallAccessError } from '../lib/call-access';
import { getMeetCallSession } from '../lib/call-session';
import {
  getMeetGuestCallAccess,
  type MeetGuestCallAccess,
} from '../lib/guest-access';
import { MEET_GUEST_COOKIE } from '../lib/guest-session';

export type SignedInMeetCallAccess = Awaited<
  ReturnType<typeof getMeetCallAccess>
>;
export type MeetCallRouteAccess =
  | (SignedInMeetCallAccess & { guest?: false })
  | MeetGuestCallAccess;

export async function resolveMeetCallRouteAccess(
  meetingId: string,
  guestCookie?: string | null,
  allowGuest = false
): Promise<MeetCallRouteAccess> {
  try {
    const access = await getMeetCallAccess(meetingId, 'Participant');
    return { ...access, guest: false as const };
  } catch (error) {
    if (
      allowGuest &&
      error instanceof MeetCallAccessError &&
      error.status === 401
    ) {
      const guest = await getMeetGuestCallAccess(meetingId, guestCookie);
      if (guest) return guest;
    }
    throw error;
  }
}

export async function callRoomService<T>(
  access: MeetCallRouteAccess,
  command: unknown,
  options?: { classroomTools: true }
): Promise<T> {
  const anonymousGuest = 'guest' in access && access.guest === true;
  const session = await getMeetCallSession({
    guest: anonymousGuest,
    guestTurnstileVerified: anonymousGuest
      ? access.turnstileVerified
      : undefined,
    meetingId: access.meeting.id,
    wsId: access.meeting.ws_id,
    userId: access.user.id,
    isHost: access.isHost,
    displayName: access.displayName,
    admission: access.admission,
    avatarUrl: 'avatarUrl' in access ? access.avatarUrl : undefined,
    service: true,
    ...(options?.classroomTools ? { classroomTools: true } : {}),
    workspaceMember: access.canReadWorkspace,
  });
  const url = new URL(session.realtimeUrl);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '/room-service';
  url.search = '';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  });
  if (!response.ok)
    throw new MeetCallAccessError(
      response.status,
      'Room action is unavailable'
    );
  return response.json() as Promise<T>;
}
export async function personalWorkspace(userId: string) {
  const db = await createAdminClient({ noCookie: true });
  const { data, error } = await db
    .from('workspaces')
    .select('id, deleted')
    .eq('creator_id', userId)
    .eq('personal', true)
    .single();
  if (error || !data || data.deleted === true)
    throw new MeetCallAccessError(503, 'Personal workspace is unavailable');
  return data.id;
}
export async function meetCallRoomRoute(
  request: Request,
  meetingId: string,
  allowGuest: boolean,
  run: (access: MeetCallRouteAccess) => Promise<unknown>
) {
  try {
    if (
      request.method !== 'GET' &&
      request.headers.get('origin') !== new URL(request.url).origin
    )
      throw new MeetCallAccessError(403, 'Invalid origin');
    const cookieStore = await cookies();
    const access = await resolveMeetCallRouteAccess(
      meetingId,
      cookieStore.get(MEET_GUEST_COOKIE)?.value,
      allowGuest
    );
    const result = await run(access);
    if (result instanceof Response) {
      result.headers.set('Cache-Control', 'private, no-store');
      return result;
    }
    return Response.json(result, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    const status =
      error instanceof AccountServiceError ||
      error instanceof MeetCallAccessError ||
      error instanceof WorkspaceStorageError
        ? error.status
        : error instanceof z.ZodError || error instanceof SyntaxError
          ? 400
          : 500;
    if (status >= 500)
      console.error('Meet room action failed', {
        name: error instanceof Error ? error.name : 'unknown',
      });
    const retryAfterSeconds =
      error instanceof MeetCallAccessError
        ? error.retryAfterSeconds
        : undefined;
    return Response.json(
      {
        code: error instanceof MeetCallAccessError ? error.code : undefined,
        error:
          error instanceof MeetCallAccessError
            ? error.message
            : 'Room action failed',
        retryAfterSeconds,
      },
      {
        status,
        headers: {
          'Cache-Control': 'private, no-store',
          ...(retryAfterSeconds === undefined
            ? {}
            : { 'Retry-After': String(retryAfterSeconds) }),
        },
      }
    );
  }
}

export async function roomRoute(
  request: Request,
  meetingId: string,
  run: (access: SignedInMeetCallAccess) => Promise<unknown>
) {
  return meetCallRoomRoute(request, meetingId, false, async (access) => {
    if ('guest' in access && access.guest)
      throw new MeetCallAccessError(401, 'Sign in to join');
    return run(access);
  });
}

/** Poll list and vote accept verified anonymous guest cookies. */
export async function guestPollRoomRoute(
  request: Request,
  meetingId: string,
  run: (access: MeetCallRouteAccess) => Promise<unknown>
) {
  return meetCallRoomRoute(request, meetingId, true, run);
}
