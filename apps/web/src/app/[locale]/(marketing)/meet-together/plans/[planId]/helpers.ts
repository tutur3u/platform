import { createClient } from '@ncthub/supabase/next/server';
import type { MeetTogetherPlan } from '@ncthub/types/primitives/MeetTogetherPlan';
import { notFound } from 'next/navigation';

export async function getPlan(planId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
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
