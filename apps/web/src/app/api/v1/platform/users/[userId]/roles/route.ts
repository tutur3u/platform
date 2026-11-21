import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import { z } from 'zod';

const roleUpdate = z
  .strictObject({
    enabled: z.boolean(),
    allow_challenge_management: z.boolean(),
    allow_manage_all_challenges: z.boolean(),
    allow_role_management: z.boolean(),
    allow_workspace_creation: z.boolean(),
  })
  .partial()
  .refine((changes) => Object.keys(changes).length > 0);

function respond(message: string, status: number) {
  return Response.json({ message }, { status });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: session, error: sessionError } =
      await supabase.auth.getClaims();
    const actor = z.uuid().safeParse(session?.claims.sub);
    if (sessionError || !actor.success) return respond('Unauthorized', 401);

    const permissions = await getPermissions({ wsId: ROOT_WORKSPACE_ID });
    if (!permissions) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (permissions.withoutPermission('manage_workspace_roles')) {
      return respond('Insufficient permissions', 403);
    }

    const actorId = actor.data.toLowerCase();
    const target = z.uuid().safeParse((await params).userId);
    if (!target.success) return respond('Invalid request', 400);
    const targetId = target.data.toLowerCase();
    if (actorId === targetId) {
      return respond('Cannot change your own platform roles', 403);
    }

    const admin = await createAdminClient({
      noCookie: true,
      auditActorId: actorId,
    });
    const { data: role, error: roleError } = await admin
      .from('platform_user_roles')
      .select('enabled, allow_role_management')
      .eq('user_id', actorId)
      .maybeSingle();
    if (roleError) {
      console.error('Platform role authorization lookup failed', {
        code: roleError.code,
      });
      return respond('Failed to verify platform role', 500);
    }
    if (!role?.enabled || !role.allow_role_management) {
      return respond('Insufficient permissions', 403);
    }
    if (session?.claims.aal !== 'aal2') {
      return respond('MFA verification required', 403);
    }

    const changes = roleUpdate.safeParse(
      await request.json().catch(() => null)
    );
    if (!changes.success) return respond('Invalid request', 400);

    const { data, error } = await admin
      .from('platform_user_roles')
      .update(changes.data)
      .eq('user_id', targetId)
      .select()
      .maybeSingle();

    if (error?.code === 'PT409') {
      return respond(
        'Cannot remove the last enabled platform role manager',
        409
      );
    }
    if (error?.code === '42501')
      return respond('Insufficient permissions', 403);
    if (error) {
      console.error('Platform user role update failed', {
        actorId,
        targetId,
        code: error.code,
      });
      return respond('Failed to update user role', 500);
    }
    if (!data) return respond('User not found', 404);

    console.info('Platform user roles updated', {
      actorId,
      targetId,
      changes: changes.data,
    });
    return Response.json({ message: 'User role updated successfully', data });
  } catch {
    console.error('Unhandled platform user role update failure');
    return respond('Internal server error', 500);
  }
}
