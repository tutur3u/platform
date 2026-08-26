import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { withSessionAuth } from '@/lib/api-auth';
import { resolveWorkspaceExternalProjectBinding } from '@/lib/external-projects/access';
import {
  externalProjectEmailPolicySchema,
  readExternalProjectEmailPolicy,
  writeExternalProjectEmailPolicy,
} from '@/lib/external-projects/email-policy';

async function authorizePolicyManagement(user: SupabaseUser, wsId: string) {
  const [workspacePermissions, rootPermissions] = await Promise.all([
    getPermissions({ user, wsId }),
    getPermissions({ user, wsId: ROOT_WORKSPACE_ID }),
  ]);

  return {
    canManage:
      workspacePermissions?.containsPermission('manage_workspace_security') ??
      false,
    canUseRootCredentials:
      rootPermissions?.containsPermission('manage_external_projects') ?? false,
    workspaceId: workspacePermissions?.wsId ?? wsId,
  };
}

async function loadBinding(admin: TypedSupabaseClient, wsId: string) {
  return admin
    .from('workspace_external_project_bindings')
    .select('settings')
    .eq('ws_id', wsId)
    .maybeSingle();
}

export const GET = withSessionAuth<{ wsId: string }>(
  async (_request, _context, { wsId }) => {
    const access = await authorizePolicyManagement(_context.user, wsId);
    if (!access.canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const admin = (await createAdminClient()) as TypedSupabaseClient;
    const binding = await resolveWorkspaceExternalProjectBinding(
      access.workspaceId,
      admin
    );

    if (!binding.enabled) {
      return NextResponse.json(
        { error: 'This workspace is not linked to an external app' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      canUseRootCredentials: access.canUseRootCredentials,
      policy: readExternalProjectEmailPolicy(binding.settings),
    });
  }
);

export const PUT = withSessionAuth<{ wsId: string }>(
  async (request, context, { wsId }) => {
    const access = await authorizePolicyManagement(context.user, wsId);
    if (!access.canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const parsed = externalProjectEmailPolicySchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { details: parsed.error.flatten(), error: 'Invalid email policy' },
        { status: 400 }
      );
    }
    const requested = parsed.data;
    const admin = (await createAdminClient()) as TypedSupabaseClient;
    const { data: binding, error } = await loadBinding(
      admin,
      access.workspaceId
    );

    if (error) {
      throw new Error(error.message);
    }
    if (!binding) {
      return NextResponse.json(
        { error: 'This workspace is not linked to an external app' },
        { status: 404 }
      );
    }

    const current = readExternalProjectEmailPolicy(binding.settings);
    if (
      requested.useRootWorkspaceCredentials !==
        current.useRootWorkspaceCredentials &&
      !access.canUseRootCredentials
    ) {
      return NextResponse.json(
        {
          error: 'Only a platform administrator can change shared mail access',
        },
        { status: 403 }
      );
    }

    const nextSettings = writeExternalProjectEmailPolicy(
      binding.settings,
      requested
    );
    const { error: updateError } = await admin
      .from('workspace_external_project_bindings')
      .update({
        settings: nextSettings,
        updated_by: context.user.id,
      })
      .eq('ws_id', access.workspaceId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    return NextResponse.json({ policy: requested });
  }
);
