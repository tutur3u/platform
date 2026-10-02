import {
  CLI_APP_ACCESS_SCOPE,
  CLI_APP_TARGET_APP,
} from '@tuturuuu/auth/cli-session';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { getDefaultAppSessionVerificationOptions } from '@/lib/api-auth-audiences';
import { hasBoardShareWorkspaceAccess } from './board-share-access';

const preferenceKey = 'HIDDEN_WORKSPACE';
const guestPreferencePrefix = 'HIDDEN_WORKSPACE:';
const headers = { 'Cache-Control': 'private, no-store' };
const bodySchema = z
  .object({
    workspaceId: z.uuid(),
    hidden: z.boolean(),
    expectedActorId: z.uuid(),
  })
  .strict();

// This owner-only preference must never be joined into workspace/member payloads.
// Canonical workspace membership remains the source for access and services.
export const GET = withSessionAuth(
  async (req, { user, supabase }) => {
    await connection();
    const expectedActor = new URL(req.url).searchParams.get('expectedActorId');
    if (expectedActor !== user.id) {
      return NextResponse.json(
        { message: 'Account changed' },
        { status: 409, headers }
      );
    }
    const { data, error } = await supabase
      .from('user_workspace_configs')
      .select('ws_id')
      .eq('user_id', user.id)
      .eq('id', preferenceKey)
      .eq('value', 'true');
    const { data: guestPreferences, error: guestError } = await supabase
      .from('user_configs')
      .select('id')
      .eq('user_id', user.id)
      .like('id', 'HIDDEN\\_WORKSPACE:%')
      .eq('value', 'true');
    if (error || guestError) {
      return NextResponse.json(
        { message: 'Unable to read Hidden workspaces' },
        { status: 500, headers }
      );
    }
    return NextResponse.json(
      {
        hiddenWorkspaceIds: [
          ...new Set([
            ...(data ?? []).map((row) => row.ws_id),
            ...(guestPreferences ?? [])
              .map((row) => row.id.slice(guestPreferencePrefix.length))
              .filter((id) => z.uuid().safeParse(id).success),
          ]),
        ],
      },
      { headers }
    );
  },
  {
    allowAppSessionAuth: [
      getDefaultAppSessionVerificationOptions(
        '/api/v1/users/me/hidden-workspaces'
      ),
      { targetApp: CLI_APP_TARGET_APP, requiredScope: CLI_APP_ACCESS_SCOPE },
    ],
  }
);

export const PUT = withSessionAuth(
  async (req, { user, supabase }) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { message: 'Invalid JSON body' },
        { status: 400, headers }
      );
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request data' },
        { status: 400, headers }
      );
    }
    const { workspaceId, hidden, expectedActorId } = parsed.data;
    // A comparison guard binds delayed client operations to their initiating
    // account. Actor identity always comes from the authenticated server session.
    if (expectedActorId !== user.id) {
      return NextResponse.json(
        { message: 'Account changed' },
        { status: 409, headers }
      );
    }
    const membership = await verifyWorkspaceMembershipType({
      requiredType: 'ANY',
      wsId: workspaceId,
      userId: user.id,
      supabase,
    });
    let guestAccess = false;
    if (!membership.ok && membership.error === 'membership_missing') {
      try {
        guestAccess = await hasBoardShareWorkspaceAccess(
          supabase,
          user.id,
          workspaceId
        );
      } catch {
        return NextResponse.json(
          { message: 'Unable to update Hidden workspaces' },
          { status: 500, headers }
        );
      }
    }
    if (!membership.ok && !guestAccess) {
      return NextResponse.json(
        { message: 'Unable to update Hidden workspaces' },
        {
          status: membership.error === 'membership_lookup_failed' ? 500 : 403,
          headers,
        }
      );
    }
    // A former member can still be a board-share guest. The membership-bound
    // RLS cannot remove their stale member preference, so this narrow server
    // cleanup runs only after access validation and filters the verified owner.
    let memberPreferenceClient = supabase;
    if (!hidden && guestAccess) {
      try {
        memberPreferenceClient = await createAdminClient({ noCookie: true });
      } catch {
        return NextResponse.json(
          { message: 'Unable to update Hidden workspaces' },
          { status: 500, headers }
        );
      }
    }
    const guestKey = `${guestPreferencePrefix}${workspaceId}`;
    const guestResult = hidden
      ? guestAccess
        ? await supabase
            .from('user_configs')
            .upsert(
              { user_id: user.id, id: guestKey, value: 'true' },
              { onConflict: 'user_id,id' }
            )
        : { error: null }
      : await supabase
          .from('user_configs')
          .delete()
          .eq('user_id', user.id)
          .eq('id', guestKey);
    if (guestResult.error) {
      return NextResponse.json(
        { message: 'Unable to update Hidden workspaces' },
        { status: 500, headers }
      );
    }
    const result = hidden
      ? membership.ok
        ? await supabase.from('user_workspace_configs').upsert(
            {
              user_id: user.id,
              ws_id: workspaceId,
              id: preferenceKey,
              value: 'true',
            },
            { onConflict: 'user_id,ws_id,id' }
          )
        : { error: null }
      : await memberPreferenceClient
          .from('user_workspace_configs')
          .delete()
          .eq('user_id', user.id)
          .eq('ws_id', workspaceId)
          .eq('id', preferenceKey);
    if (result.error) {
      return NextResponse.json(
        { message: 'Unable to update Hidden workspaces' },
        { status: 500, headers }
      );
    }
    return NextResponse.json({ workspaceId, hidden }, { headers });
  },
  { allowAppSessionAuth: true }
);
