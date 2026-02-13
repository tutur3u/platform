import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';

export async function getPlan(planId: string) {
  const sbAdmin = await createAdminClient();

  // planId is an uuid without dashes, so we need to add them back in
  planId = planId.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

  const { data, error } = await sbAdmin
    .from('meet_together_plans')
    .select('*')
    .eq('id', planId)
    .single();

  if (error || !data) {
    console.error(error);
    return null;
  }

  return data as MeetTogetherPlan;
}
