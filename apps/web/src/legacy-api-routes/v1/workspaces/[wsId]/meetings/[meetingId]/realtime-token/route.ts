import type {
  MeetRealtimeRole,
  MeetRealtimeRoomMode,
} from '@tuturuuu/realtime/meet';
import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  getMeetRealtimeUrl,
  signMeetJoinToken,
} from '@/lib/meet/realtime-token';

const requestSchema = z.object({
  mode: z.enum(['call', 'webinar', 'stream']).default('call'),
  role: z.enum(['host', 'speaker', 'viewer']).optional(),
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
}: {
  isCreator: boolean;
  requestedRole?: MeetRealtimeRole;
}) {
  if (!isCreator) {
    return 'viewer';
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
  if (!isCreator) {
    return 'webinar';
  }

  return requestedMode;
}

async function parseRequestBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
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

    const body = requestSchema.parse(await parseRequestBody(request));
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
      serverLogger.error('Failed to load Meet meeting for realtime token', {
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
    });
    const mode = resolveRequestedMode({
      isCreator,
      requestedMode: body.mode,
    });

    const signed = signMeetJoinToken({
      displayName: getDisplayName(auth.user),
      meetingId,
      mode,
      role,
      userId: auth.user.id,
      wsId,
    });

    return NextResponse.json({
      expiresAt: signed.expiresAt.toISOString(),
      limits: signed.payload.limits,
      mode: signed.payload.mode,
      realtimeUrl: getMeetRealtimeUrl(),
      role: signed.payload.role,
      roomId: signed.payload.roomId,
      token: signed.token,
    });
  } catch (error) {
    serverLogger.error('Failed to create Meet realtime token', {
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
