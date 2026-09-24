import type {
  MeetRealtimeRole,
  MeetRealtimeRoomMode,
} from '@tuturuuu/realtime/meet';
import { getHostMeetingDurationSeconds } from '@tuturuuu/utils/meet-duration';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import {
  getMeetRealtimeUrl,
  meetDeviceIdentity,
  signMeetJoinToken,
} from '@/lib/meet/realtime-token';

const requestSchema = z.object({
  mode: z.enum(['call', 'webinar', 'stream']).default('call'),
  role: z.enum(['host', 'speaker', 'viewer']).optional(),
  deviceId: z.uuid().optional(),
  joinMode: z.enum(['switch', 'additional']).optional(),
});

type Params = {
  params: Promise<{
    meetingId: string;
    wsId: string;
  }>;
};

function getDisplayName(user: { email?: string | null }) {
  return user.email?.split('@')[0]?.trim() || 'Tuturuuu member';
}

function resolveRequestedRole({
  isCreator,
  requestedRole,
  requestedMode,
}: {
  isCreator: boolean;
  requestedRole?: MeetRealtimeRole;
  requestedMode: MeetRealtimeRoomMode;
}) {
  if (!isCreator) {
    return requestedMode === 'call' ? 'speaker' : 'viewer';
  }

  return requestedRole ?? 'host';
}

function resolveRequestedMode({
  isCreator,
  requestedMode,
}: {
  isCreator: boolean;
  requestedMode: MeetRealtimeRoomMode;
}) {
  if (!isCreator && requestedMode !== 'call') {
    return 'webinar';
  }

  return requestedMode;
}

async function parseRequestBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: Request, { params }: Params) {
  const { meetingId, wsId: rawWsId } = await params;

  try {
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: { targetApp: 'meet' },
    });
    if (!auth.ok) {
      return auth.response;
    }

    const parsed = requestSchema.safeParse(await parseRequestBody(request));
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }
    const body = parsed.data;
    const wsId = await normalizeWorkspaceId(rawWsId, auth.supabase);
    const membership = await verifyWorkspaceMembershipType({
      supabase: auth.supabase,
      userId: auth.user.id,
      wsId,
    });

    if (membership.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      );
    }

    if (!membership.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      );
    }

    const { data: meeting, error } = await auth.supabase
      .from('workspace_meetings')
      .select('creator_id,id,ws_id')
      .eq('id', meetingId)
      .eq('ws_id', wsId)
      .maybeSingle();

    if (error) {
      console.error('Failed to load Meet meeting for realtime token', {
        error: error.message,
        meetingId,
        wsId,
      });
      return NextResponse.json(
        { error: 'Failed to load meeting' },
        { status: 500 }
      );
    }

    if (!meeting) {
      return NextResponse.json({ error: 'Meeting not found' }, { status: 404 });
    }

    const isCreator = meeting.creator_id === auth.user.id;
    const role = resolveRequestedRole({
      isCreator,
      requestedRole: body.role,
      requestedMode: body.mode,
    });
    const mode = resolveRequestedMode({
      isCreator,
      requestedMode: body.mode,
    });

    const deviceUserId = body.deviceId
      ? await meetDeviceIdentity(auth.user.id, body.deviceId)
      : auth.user.id;
    const signed = signMeetJoinToken({
      accountId: body.deviceId ? auth.user.id : undefined,
      maxRoomDurationSeconds: await getHostMeetingDurationSeconds(
        meeting.creator_id
      ),
      displayName: getDisplayName(auth.user),
      meetingId,
      mode,
      role,
      userId: deviceUserId,
      wsId,
    });

    if (body.deviceId && body.joinMode !== 'additional') {
      const endpoint = new URL(getMeetRealtimeUrl());
      endpoint.protocol = endpoint.protocol === 'wss:' ? 'https:' : 'http:';
      endpoint.pathname = '/room-device';
      endpoint.search = '';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${signed.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: body.joinMode }),
        signal: AbortSignal.timeout(5000),
      }).catch((error: unknown) => {
        console.warn('Meet device connection check unavailable', {
          kind: error instanceof Error ? error.name : 'unknown',
        });
        return null;
      });
      if (!response?.ok) {
        return NextResponse.json(
          { error: 'Meeting connection unavailable' },
          { status: 503, headers: { 'Retry-After': '2' } }
        );
      }
      const policy = (await response.json()) as { otherDeviceCount: number };
      if (!body.joinMode && policy.otherDeviceCount) {
        return NextResponse.json({
          requiresDeviceChoice: true,
          otherDeviceCount: policy.otherDeviceCount,
        });
      }
    }

    return NextResponse.json({
      requiresDeviceChoice: false,
      expiresAt: signed.expiresAt.toISOString(),
      limits: signed.payload.limits,
      mode: signed.payload.mode,
      realtimeUrl: getMeetRealtimeUrl(),
      role: signed.payload.role,
      roomId: signed.payload.roomId,
      token: signed.token,
    });
  } catch (error) {
    console.error('Failed to create Meet realtime token', {
      error: error instanceof Error ? error.message : String(error),
      meetingId,
      rawWsId,
    });
    return NextResponse.json(
      { error: 'Meet realtime token creation failed' },
      { status: 500 }
    );
  }
}
