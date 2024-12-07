import { MeetTogetherPlan } from '@/types/primitives/MeetTogetherPlan';
import { createAdminClient } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';

export async function getPlan(planId: string) {
  const sbAdmin = await createAdminClient();

  // planId is an uuid without dashes, so we need to add them back in
  planId = planId.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');

  const queryBuilder = sbAdmin
    .from('meet_together_plans')
    .select('*')
    .eq('id', planId)
    .single();

  const { data, error } = await queryBuilder;

  if (error) {
    console.log(error);
    notFound();
  }

  return data as MeetTogetherPlan;
}
