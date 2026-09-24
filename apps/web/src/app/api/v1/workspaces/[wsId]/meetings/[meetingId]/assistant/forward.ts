import { createAppSessionToken } from '@tuturuuu/auth/app-session';
import {
  normalizeWorkspaceId,
  WorkspaceAuthError,
  WorkspaceNotFoundError,
  WorkspaceResolutionError,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { getMeetAppOrigin } from '@/lib/meet-app-url';

const noStore = { 'Cache-Control': 'private, no-store' };

export async function forwardMeetAssistant(
  request: Request,
  params: { meetingId: string; wsId: string },
  action: 'assistant' | 'assistant/review'
) {
  const { meetingId, wsId: rawWsId } = params;
  try {
    const requestOrigin = request.headers.get('origin');
    if (requestOrigin && requestOrigin !== new URL(request.url).origin) {
      return NextResponse.json(
        { error: 'Invalid origin' },
        { status: 403, headers: noStore }
      );
    }
    const auth = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: { targetApp: 'meet' },
    });
    if (!auth.ok) return auth.response;
    let wsId: string;
    try {
      wsId = await normalizeWorkspaceId(rawWsId, auth.supabase);
    } catch (error) {
      if (error instanceof WorkspaceAuthError) {
        return NextResponse.json(
          { error: 'Workspace lookup failed' },
          { status: 401, headers: noStore }
        );
      }
      if (error instanceof WorkspaceNotFoundError) {
        return NextResponse.json(
          { error: 'Meeting not found' },
          { status: 404, headers: noStore }
        );
      }
      if (error instanceof WorkspaceResolutionError) {
        return NextResponse.json(
          { error: 'Workspace lookup failed' },
          { status: 500, headers: noStore }
        );
      }
      throw error;
    }
    const { data: meeting, error } = await auth.supabase
      .from('workspace_meetings')
      .select('id')
      .eq('id', meetingId)
      .eq('ws_id', wsId)
      .maybeSingle();
    if (error) {
      console.error('Meet assistant meeting lookup failed', {
        meetingId,
        wsId,
        error: error.message,
      });
      return NextResponse.json(
        { error: 'Meeting lookup failed' },
        { status: 500, headers: noStore }
      );
    }
    if (!meeting) {
      return NextResponse.json(
        { error: 'Meeting not found' },
        { status: 404, headers: noStore }
      );
    }
    const requestUrl = new URL(request.url);
    const messageId = requestUrl.searchParams.get('messageId');
    if (
      request.method === 'GET' &&
      messageId !== null &&
      (messageId.length < 1 || messageId.length > 200)
    ) {
      return NextResponse.json(
        { error: 'Invalid review' },
        { status: 400, headers: noStore }
      );
    }
    const body = request.method === 'POST' ? await request.text() : undefined;
    if (body && new TextEncoder().encode(body).length > 8_000) {
      return NextResponse.json(
        { error: 'Message too large' },
        { status: 413, headers: noStore }
      );
    }
    const origin = getMeetAppOrigin();
    const endpoint = new URL(
      `/api/meet-call/${encodeURIComponent(meetingId)}/${action}`,
      origin
    );
    if (action === 'assistant/review' && messageId !== null) {
      endpoint.searchParams.set('messageId', messageId);
    }
    const session = createAppSessionToken({
      email: auth.user.email,
      expiresInSeconds: 180,
      targetApp: 'meet',
      userId: auth.user.id,
    });
    const upstream = await fetch(endpoint, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${session.token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        Origin: endpoint.origin,
      },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(request.method === 'GET' ? 15_000 : 120_000),
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: { ...noStore, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Meet assistant gateway failed', {
      action,
      meetingId,
      kind: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'Meet assistant unavailable' },
      { status: 503, headers: noStore }
    );
  }
}
