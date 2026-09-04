import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { verifyWorkspaceMembershipType } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const settingsUpdateSchema = z.object({
  missed_entry_date_threshold: z.number().int().min(0).max(3660).nullable(),
});

export const GET = withSessionAuth<{ wsId: string }>(
  async (request, { user, supabase }, { wsId }) => {
    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase, request);
    const membership = await verifyWorkspaceMembershipType({
      supabase,
      userId: user.id,
      wsId: normalizedWsId,
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

    const sbAdmin = await createAdminClient();
    const [{ data: workspace, error: workspaceError }, settingsResult] =
      await Promise.all([
        sbAdmin
          .from('workspaces')
          .select('personal')
          .eq('id', normalizedWsId)
          .maybeSingle(),
        sbAdmin
          .from('workspace_settings')
          .select('missed_entry_date_threshold')
          .eq('ws_id', normalizedWsId)
          .maybeSingle(),
      ]);

    if (workspaceError || settingsResult.error) {
      console.error('Failed to load time tracking workspace settings:', {
        settingsError: settingsResult.error,
        workspaceError,
        wsId: normalizedWsId,
      });
      return NextResponse.json(
        { error: 'Failed to fetch workspace settings' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      missed_entry_date_threshold: workspace?.personal
        ? null
        : (settingsResult.data?.missed_entry_date_threshold ?? null),
    });
  },
  {
    allowAppSessionAuth: { targetApp: 'track' },
    cache: { maxAge: 60, swr: 30 },
  }
);

export const POST = withSessionAuth<{ wsId: string }>(
  async (request, { user, supabase }, { wsId }) => {
    const parsedBody = settingsUpdateSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: 'Invalid settings' }, { status: 400 });
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase, request);
    const membership = await verifyWorkspaceMembershipType({
      supabase,
      userId: user.id,
      wsId: normalizedWsId,
    });
    if (!membership.ok) {
      return NextResponse.json(
        { error: 'Workspace access denied' },
        { status: membership.error === 'membership_lookup_failed' ? 500 : 403 }
      );
    }

    const sbAdmin = await createAdminClient();
    const { data, error } = await sbAdmin
      .from('workspace_settings')
      .upsert({ ...parsedBody.data, ws_id: normalizedWsId })
      .select('missed_entry_date_threshold')
      .single();
    if (error) {
      console.error('Failed to update time tracking workspace settings:', {
        error,
        wsId: normalizedWsId,
      });
      return NextResponse.json(
        { error: 'Failed to update workspace settings' },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  },
  { allowAppSessionAuth: { targetApp: 'track' } }
);
