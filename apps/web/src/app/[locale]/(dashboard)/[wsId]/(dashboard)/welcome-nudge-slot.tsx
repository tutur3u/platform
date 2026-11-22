import { createClient } from '@tuturuuu/supabase/next/server';
import { shouldShowWelcomeNudge } from '@/lib/onboarding/welcome-gate';
import WelcomeNudge from './welcome-nudge';

/**
 * The "Finish setting up" entry for a recent account that has neither finished
 * nor skipped the welcome flow. Rendering nothing is always safe.
 */
export default async function WelcomeNudgeSlot({
  createdAt,
  userId,
}: {
  createdAt: string | null | undefined;
  userId: string;
}) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('onboarding_progress')
    .select('completed_at, dismissed_at')
    .eq('user_id', userId)
    .maybeSingle();

  return shouldShowWelcomeNudge({
    progress: data,
    userCreatedAt: createdAt,
  }) ? (
    <WelcomeNudge />
  ) : null;
}
