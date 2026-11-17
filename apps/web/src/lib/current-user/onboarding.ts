import {
  type CurrentUserReadContext,
  type SectionOutcome,
  timeDb,
} from './context';

/** Body of `GET /api/v1/user/onboarding-progress`. */
export async function readOnboardingProgress(
  ctx: CurrentUserReadContext
): Promise<SectionOutcome> {
  const { supabase, user } = ctx;
  const { data, error } = await timeDb(ctx, () =>
    supabase
      .from('onboarding_progress')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()
  );

  if (error) {
    return {
      body: { message: 'Failed to fetch onboarding progress' },
      log: ['Error fetching onboarding progress:', error],
      status: 500,
    };
  }

  return { body: data, status: 200 };
}
