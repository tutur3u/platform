import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { MeetTogetherPlan } from '@tuturuuu/types/primitives/MeetTogetherPlan';
import { notFound } from 'next/navigation';

export async function getPlan(planId: string, wsId?: string) {
  const sbAdmin = await createAdminClient();

  // planId is an uuid without dashes, so we need to add them back in
  planId = planId.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

  let queryBuilder = sbAdmin
    .from('meet_together_plans')
    .select('*')
    .eq('id', planId);

  // If workspace ID is provided, filter by workspace
  if (wsId) {
    queryBuilder = queryBuilder.eq('ws_id', wsId);
  }

  const { data, error } = await queryBuilder.single();

  if (error) {
    console.log(error);
    notFound();
  }

  return data as MeetTogetherPlan;
}
