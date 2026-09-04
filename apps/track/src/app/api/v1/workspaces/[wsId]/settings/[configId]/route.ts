import { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  verifyWorkspaceMembershipType,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { normalizeWorkspaceId } from '@/lib/workspace-helper';

const ALLOW_FUTURE_SESSIONS_CONFIG_ID = 'ALLOW_FUTURE_SESSIONS';
const updateSchema = z.object({ value: z.enum(['true', 'false']) });

export const GET = withSessionAuth<{ wsId: string; configId: string }>(
  async (request, { user, supabase }, { configId, wsId }) => {
    if (configId !== ALLOW_FUTURE_SESSIONS_CONFIG_ID) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
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
      .from('workspace_configs')
      .select('value')
      .eq('ws_id', normalizedWsId)
      .eq('id', configId)
      .maybeSingle();
    if (error) {
      console.error('Failed to load time tracking workspace config:', {
        configId,
        error,
        wsId: normalizedWsId,
      });
      return NextResponse.json(
        { error: 'Failed to fetch workspace config' },
        { status: 500 }
      );
    }
    if (!data) return NextResponse.json({}, { status: 404 });

    return NextResponse.json({ value: data.value });
  },
  { allowAppSessionAuth: { targetApp: 'track' } }
);

export const PUT = withSessionAuth<{ wsId: string; configId: string }>(
  async (request, { user, supabase }, { configId, wsId }) => {
    if (configId !== ALLOW_FUTURE_SESSIONS_CONFIG_ID) {
      return NextResponse.json({ error: 'Config not found' }, { status: 404 });
    }

    const parsedBody = updateSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Invalid config value' },
        { status: 400 }
      );
    }

    const normalizedWsId = await normalizeWorkspaceId(wsId, supabase, request);
    const permissions = await getPermissions({
      user,
      wsId: normalizedWsId,
    });
    if (!permissions) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (permissions.withoutPermission('manage_workspace_settings')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const sbAdmin = await createAdminClient();
    const { error } = await sbAdmin.from('workspace_configs').upsert({
      id: configId,
      updated_at: new Date().toISOString(),
      value: parsedBody.data.value,
      ws_id: normalizedWsId,
    });
    if (error) {
      console.error('Failed to update time tracking workspace config:', {
        configId,
        error,
        wsId: normalizedWsId,
      });
      return NextResponse.json(
        { error: 'Failed to update workspace config' },
        { status: 500 }
      );
    }

    return NextResponse.json({ message: 'success' });
  },
  { allowAppSessionAuth: { targetApp: 'track' } }
);
