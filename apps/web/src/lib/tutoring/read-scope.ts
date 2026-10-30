import type { createAdminClient } from '@tuturuuu/supabase/next/server';
import {
  createTutoringRequestClient,
  type resolveTutoringRouteAccess,
} from './route-access';

/** Resolve identity before any admin read of teacher work hours. */
export async function resolveTutoringReadScope({
  request,
  access,
  sbAdmin,
  teacherId,
}: {
  request: Request;
  access: Awaited<ReturnType<typeof resolveTutoringRouteAccess>>;
  sbAdmin: Awaited<ReturnType<typeof createAdminClient>>;
  teacherId?: string;
}): Promise<
  { allowed: false } | { allowed: true; teacherId: string | undefined }
> {
  if (!access.permissions) return { allowed: false };
  if (!access.permissions.withoutPermission('view_payroll'))
    return { allowed: true, teacherId };
  const actor =
    access.user ??
    (
      await (
        await createTutoringRequestClient(request, access.user)
      ).auth.getUser()
    ).data.user;
  if (!actor) return { allowed: false };
  const { data: linked, error } = await sbAdmin
    .from('workspace_user_linked_users')
    .select('virtual_user_id')
    .eq('ws_id', access.normalizedWsId)
    .eq('platform_user_id', actor.id)
    .maybeSingle();
  if (error || !linked || (teacherId && teacherId !== linked.virtual_user_id))
    return { allowed: false };
  return { allowed: true, teacherId: linked.virtual_user_id };
}
