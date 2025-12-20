/**
 * Calendar Accounts Management API
 *
 * CRUD operations for managing connected calendar accounts.
 * GET - List all connected accounts for a workspace
 * DELETE - Disconnect an account
 */

import { createClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const accountsQuerySchema = z.object({
  wsId: z.string(),
});

const disconnectQuerySchema = z.object({
  accountId: z.string(),
  wsId: z.string(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: 'User not authenticated' },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const queryParams = Object.fromEntries(url.searchParams.entries());

  const result = accountsQuerySchema.safeParse(queryParams);
  if (!result.success) {
    return NextResponse.json(
      { error: 'Missing or invalid workspace ID' },
      { status: 400 }
    );
  }

  const { wsId } = result.data;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  try {
    const { data: accounts, error } = await supabase
      .from('calendar_auth_tokens')
      .select(
        'id, provider, account_email, account_name, is_active, created_at, expires_at'
      )
      .eq('user_id', user.id)
      .eq('ws_id', normalizedWsId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching accounts:', error);
      return NextResponse.json(
        { error: 'Failed to fetch accounts' },
        { status: 500 }
      );
    }

    // Group accounts by provider
    const grouped = {
      google: accounts?.filter((a) => a.provider === 'google') || [],
      microsoft: accounts?.filter((a) => a.provider === 'microsoft') || [],
    };

    return NextResponse.json(
      {
        accounts: accounts || [],
        grouped,
        total: accounts?.length || 0,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in GET /api/v1/calendar/auth/accounts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: 'User not authenticated' },
      { status: 401 }
    );
  }

  const url = new URL(request.url);
  const queryParams = Object.fromEntries(url.searchParams.entries());

  const result = disconnectQuerySchema.safeParse(queryParams);
  if (!result.success) {
    return NextResponse.json(
      { error: 'Missing accountId or wsId' },
      { status: 400 }
    );
  }

  const { accountId, wsId } = result.data;
  const normalizedWsId = await normalizeWorkspaceId(wsId);

  try {
    // First, verify the account belongs to this user and workspace
    const { data: account, error: fetchError } = await supabase
      .from('calendar_auth_tokens')
      .select('id, provider, account_email')
      .eq('id', accountId)
      .eq('user_id', user.id)
      .eq('ws_id', normalizedWsId)
      .single();

    if (fetchError || !account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Soft delete: mark as inactive instead of hard delete
    // This preserves history and allows recovery
    const { error: updateError } = await supabase
      .from('calendar_auth_tokens')
      .update({ is_active: false })
      .eq('id', accountId)
      .eq('user_id', user.id)
      .eq('ws_id', normalizedWsId);

    if (updateError) {
      console.error('Error disconnecting account:', updateError);
      return NextResponse.json(
        { error: 'Failed to disconnect account' },
        { status: 500 }
      );
    }

    // Also disable calendar connections for this account
    const { error: connectionsError } = await supabase
      .from('calendar_connections')
      .update({ is_enabled: false })
      .eq('auth_token_id', accountId);

    if (connectionsError) {
      console.error('Error disabling calendar connections:', connectionsError);
      // We don't return error here because the main account is already disconnected
    }

    return NextResponse.json(
      {
        success: true,
        message: `${account.provider} account ${account.account_email || ''} disconnected`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error in DELETE /api/v1/calendar/auth/accounts:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
