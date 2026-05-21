import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { resolveSessionAuthContext } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const wsId = url.searchParams.get('wsId');

    const authContext = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: { targetApp: 'calendar' },
    });

    if (!authContext.ok) return authContext.response;
    const { supabase, user } = authContext;

    // Fetch the user's tokens from the calendar_auth_tokens table
    let tokenQuery = supabase
      .from('calendar_auth_tokens')
      .select('*')
      .eq('user_id', user.id);

    if (wsId) {
      const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
      const memberCheck = await verifyWorkspaceMembershipType({
        wsId: normalizedWsId,
        userId: user.id,
        supabase,
      });

      if (memberCheck.error === 'membership_lookup_failed') {
        return NextResponse.json(
          { error: 'Failed to verify workspace access' },
          { status: 500 }
        );
      }

      if (!memberCheck.ok) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      tokenQuery = tokenQuery.eq('ws_id', normalizedWsId);
    }

    const { data: tokenData, error: tokenError } = await tokenQuery.single();

    if (tokenError) {
      if (tokenError.code === 'PGRST116') {
        // No tokens found for the user
        return NextResponse.json({ tokens: null }, { status: 200 });
      }
      console.error('Error fetching tokens:', tokenError);
      return NextResponse.json(
        { error: 'Failed to fetch tokens' },
        { status: 500 }
      );
    }

    if (!tokenData) {
      return NextResponse.json({ tokens: null }, { status: 200 });
    }

    return NextResponse.json(
      { tokens: tokenData },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, max-age=60, stale-while-revalidate=30',
        },
      }
    );
  } catch (error) {
    console.error('Error in /api/v1/calendar/auth/tokens:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const authContext = await resolveSessionAuthContext(request, {
      allowAppSessionAuth: { targetApp: 'calendar' },
    });

    if (!authContext.ok) return authContext.response;
    const { supabase, user } = authContext;

    // Get wsId from query parameters
    const url = new URL(request.url);
    const wsId = url.searchParams.get('wsId');

    if (!wsId) {
      return NextResponse.json(
        { error: 'Missing workspace ID' },
        { status: 400 }
      );
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
    const memberCheck = await verifyWorkspaceMembershipType({
      wsId: normalizedWsId,
      userId: user.id,
      supabase,
    });

    if (memberCheck.error === 'membership_lookup_failed') {
      return NextResponse.json(
        { error: 'Failed to verify workspace access' },
        { status: 500 }
      );
    }

    if (!memberCheck.ok) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete the user's tokens for this workspace
    const { error: deleteError } = await supabase
      .from('calendar_auth_tokens')
      .delete()
      .eq('user_id', user.id)
      .eq('ws_id', normalizedWsId);

    if (deleteError) {
      console.error('Error deleting tokens:', deleteError);
      return NextResponse.json(
        { error: 'Failed to disconnect Google Calendar' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Google Calendar disconnected successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in DELETE /api/v1/calendar/auth/tokens:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
