import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { verifyWorkspaceMembershipType } from './workspace-helper';

interface GetPlanOptions {
  actorUserId?: string | null;
}

export function normalizeMeetTogetherPlanId(planId: string) {
  const trimmed = planId.trim();

  return trimmed.replace(
    /^([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/iu,
    '$1-$2-$3-$4-$5'
  );
}

async function getCurrentSupabaseUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.id ?? null;
}

export async function getPlan(planId: string, options: GetPlanOptions = {}) {
  const sbAdmin = await createAdminClient();
  const normalizedPlanId = normalizeMeetTogetherPlanId(planId);

  const { data, error } = await sbAdmin
    .from('meet_together_plans')
    .select('*')
    .eq('id', normalizedPlanId)
    .maybeSingle();

  if (error || !data) {
    console.error(error);
    return null;
  }

  const plan = data as MeetTogetherPlan;

  if (plan.is_public && !plan.ws_id) {
    return plan;
  }

  const actorUserId =
    options.actorUserId === undefined
      ? await getCurrentSupabaseUserId()
      : options.actorUserId;

  if (!actorUserId) {
    return null;
  }

  if (!plan.ws_id) {
    return plan.creator_id === actorUserId ? plan : null;
  }

  const membership = await verifyWorkspaceMembershipType({
    requiredType: 'MEMBER',
    supabase: sbAdmin,
    userId: actorUserId,
    wsId: plan.ws_id,
  });

  if (!membership.ok) {
    return null;
  }

  if (plan.is_public || plan.creator_id === actorUserId) {
    return plan;
  }

  return null;
}
