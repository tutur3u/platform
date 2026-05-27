import {
  normalizeWorkspaceId,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import {
  createMeetStreamAdminClient,
  ensureMeetStreamLiveInput,
  getMeetStreamLiveInput,
  serializeMeetStreamLiveInput,
  stopMeetStreamLiveInput,
} from '@/lib/meet/stream';

const patchRequestSchema = z.object({
  action: z.enum(['resume', 'stop']),
});

type Params = {
  params: Promise<{
    meetingId: string;
    wsId: string;
  }>;
};

type MeetRouteContext =
  | {
      response: NextResponse;
    }
  | {
      isHost: boolean;
      meeting: {
        creator_id: string;
        id: string;
        name: string;
        ws_id: string;
      };
      userId: string;
      wsId: string;
    };

async function parseRequestBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function resolveMeetRouteContext(
  request: Request,
  {
    meetingId,
    rawWsId,
  }: {
    meetingId: string;
    rawWsId: string;
  }
): Promise<MeetRouteContext> {
  const auth = await resolveSessionAuthContext(request, {
    allowAppSessionAuth: { targetApp: 'meet' },
  });
  if (!auth.ok) {
    return { response: auth.response };
  }

  const wsId = await normalizeWorkspaceId(rawWsId, auth.supabase);
  const membership = await verifyWorkspaceMembershipType({
    supabase: auth.supabase,
    userId: auth.user.id,
    wsId,
  });

  if (membership.error === 'membership_lookup_failed') {
    return {
      response: NextResponse.json(
        { error: 'Failed to verify workspace membership' },
        { status: 500 }
      ),
    };
  }

  if (!membership.ok) {
    return {
      response: NextResponse.json(
        { error: 'Workspace access denied' },
        { status: 403 }
      ),
    };
  }

  const { data: meeting, error } = await auth.supabase
    .from('workspace_meetings')
    .select('creator_id,id,name,ws_id')
    .eq('id', meetingId)
    .eq('ws_id', wsId)
    .maybeSingle();

  if (error) {
    serverLogger.error('Failed to load Meet meeting for stream route', {
      error: error.message,
      meetingId,
      wsId,
    });
    return {
      response: NextResponse.json(
        { error: 'Failed to load meeting' },
        { status: 500 }
      ),
    };
  }

  if (!meeting) {
    return {
      response: NextResponse.json(
        { error: 'Meeting not found' },
        { status: 404 }
      ),
    };
  }

  return {
    isHost: meeting.creator_id === auth.user.id,
    meeting,
    userId: auth.user.id,
    wsId,
  };
}

function requireHost(context: Extract<MeetRouteContext, { isHost: boolean }>) {
  if (context.isHost) {
    return null;
  }

  return NextResponse.json(
    { error: 'Only the meeting host can manage streaming' },
    { status: 403 }
  );
}

export async function GET(request: Request, { params }: Params) {
  const { meetingId, wsId: rawWsId } = await params;

  try {
    const context = await resolveMeetRouteContext(request, {
      meetingId,
      rawWsId,
    });
    if ('response' in context) {
      return context.response;
    }

    const admin = await createMeetStreamAdminClient();
    const stream = await getMeetStreamLiveInput({
      admin,
      meetingId,
      wsId: context.wsId,
    });

    return NextResponse.json({
      stream: stream ? serializeMeetStreamLiveInput(stream) : null,
    });
  } catch (error) {
    serverLogger.error('Failed to load Meet stream state', {
      error: error instanceof Error ? error.message : String(error),
      meetingId,
      rawWsId,
    });
    return NextResponse.json(
      { error: 'Failed to load stream state' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: Params) {
  const { meetingId, wsId: rawWsId } = await params;

  try {
    const context = await resolveMeetRouteContext(request, {
      meetingId,
      rawWsId,
    });
    if ('response' in context) {
      return context.response;
    }

    const hostError = requireHost(context);
    if (hostError) {
      return hostError;
    }

    const admin = await createMeetStreamAdminClient();
    const { created, stream } = await ensureMeetStreamLiveInput({
      actorId: context.userId,
      admin,
      meetingId,
      meetingName: context.meeting.name,
      wsId: context.wsId,
    });

    return NextResponse.json(
      {
        created,
        stream: serializeMeetStreamLiveInput(stream, {
          includePublishUrl: true,
        }),
      },
      { status: created ? 201 : 200 }
    );
  } catch (error) {
    serverLogger.error('Failed to create Meet stream live input', {
      error: error instanceof Error ? error.message : String(error),
      meetingId,
      rawWsId,
    });
    return NextResponse.json(
      { error: 'Failed to create stream live input' },
      { status: 502 }
    );
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { meetingId, wsId: rawWsId } = await params;

  try {
    const context = await resolveMeetRouteContext(request, {
      meetingId,
      rawWsId,
    });
    if ('response' in context) {
      return context.response;
    }

    const hostError = requireHost(context);
    if (hostError) {
      return hostError;
    }

    const body = patchRequestSchema.parse(await parseRequestBody(request));
    const admin = await createMeetStreamAdminClient();

    if (body.action === 'resume') {
      const { created, stream } = await ensureMeetStreamLiveInput({
        actorId: context.userId,
        admin,
        meetingId,
        meetingName: context.meeting.name,
        wsId: context.wsId,
      });

      return NextResponse.json({
        created,
        stream: serializeMeetStreamLiveInput(stream, {
          includePublishUrl: true,
        }),
      });
    }

    const stream = await stopMeetStreamLiveInput({
      actorId: context.userId,
      admin,
      meetingId,
      wsId: context.wsId,
    });

    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }

    return NextResponse.json({
      stream: serializeMeetStreamLiveInput(stream),
    });
  } catch (error) {
    serverLogger.error('Failed to update Meet stream live input', {
      error: error instanceof Error ? error.message : String(error),
      meetingId,
      rawWsId,
    });
    return NextResponse.json(
      { error: 'Failed to update stream live input' },
      { status: 502 }
    );
  }
}
