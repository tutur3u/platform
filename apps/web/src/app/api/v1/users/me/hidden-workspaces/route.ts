import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';

const preferenceKey = 'HIDDEN_WORKSPACE';
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
    if (error) {
      return NextResponse.json(
        { message: 'Unable to read Hidden workspaces' },
        { status: 500, headers }
      );
    }
    return NextResponse.json(
      { hiddenWorkspaceIds: (data ?? []).map((row) => row.ws_id) },
      { headers }
    );
  },
  { allowAppSessionAuth: true }
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
    if (!membership.ok) {
      return NextResponse.json(
        { message: 'Unable to update Hidden workspaces' },
        {
          status: membership.error === 'membership_lookup_failed' ? 500 : 403,
          headers,
        }
      );
    }
    const result = hidden
      ? await supabase.from('user_workspace_configs').upsert(
          {
            user_id: user.id,
            ws_id: workspaceId,
            id: preferenceKey,
            value: 'true',
          },
          { onConflict: 'user_id,ws_id,id' }
        )
      : await supabase
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
