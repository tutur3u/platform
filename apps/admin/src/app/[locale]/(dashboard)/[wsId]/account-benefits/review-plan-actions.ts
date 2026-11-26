'use server';

import { z } from 'zod';
import { authorizeInfrastructureRootMemberRequest } from '@/lib/infrastructure-admin-access';

const grantInput = z.object({
  workspaceId: z.uuid(),
  grantId: z.uuid(),
  tier: z.enum(['PLUS', 'PRO']),
  reason: z.string().trim().min(1).max(500),
  expiresOn: z.iso.date(),
});

const revokeInput = grantInput.pick({ workspaceId: true, grantId: true });

export type ReviewPlanActionState =
  | { status: 'idle' | 'denied' | 'invalid' | 'unavailable' | 'revoked' }
  | { status: 'granted'; grantId: string };

export async function updateWorkspaceReviewPlan(
  _: ReviewPlanActionState,
  form: FormData
): Promise<ReviewPlanActionState> {
  const access = await authorizeInfrastructureRootMemberRequest('admin');
  if (
    !access.ok ||
    !access.permissions?.containsPermission('view_infrastructure')
  ) {
    return { status: 'denied' };
  }

  const input = {
    workspaceId: form.get('workspaceId'),
    grantId: form.get('grantId'),
    tier: form.get('tier'),
    reason: form.get('reason'),
    expiresOn: form.get('expiresOn'),
  };

  if (form.get('operation') === 'revoke') {
    const parsed = revokeInput.safeParse(input);
    if (!parsed.success) return { status: 'invalid' };
    const { data, error } = await access.sbAdmin.rpc(
      'revoke_workspace_review_plan_grant',
      {
        p_actor_id: access.user.id,
        p_ws_id: parsed.data.workspaceId,
        p_grant_id: parsed.data.grantId,
      }
    );
    return { status: !error && data ? 'revoked' : 'unavailable' };
  }

  if (form.get('operation') !== 'grant') return { status: 'invalid' };
  const parsed = grantInput.safeParse(input);
  if (!parsed.success) return { status: 'invalid' };
  const { workspaceId, grantId, tier, reason, expiresOn } = parsed.data;
  const expiresAt = new Date(`${expiresOn}T00:00:00Z`);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 1);
  if (expiresAt.getTime() <= Date.now()) return { status: 'invalid' };
  const { data, error } = await access.sbAdmin.rpc(
    'create_workspace_review_plan_grant',
    {
      p_actor_id: access.user.id,
      p_ws_id: workspaceId,
      p_grant_id: grantId,
      p_tier: tier,
      p_reason: reason,
      p_expires_at: expiresAt.toISOString(),
    }
  );
  return !error && data
    ? { status: 'granted', grantId: data }
    : { status: 'unavailable' };
}
