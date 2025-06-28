import {
  getCurrentUser,
  getUserDefaultWorkspace,
} from '@tuturuuu/utils/user-helper';
import { redirect } from 'next/navigation';
import {
  checkUserWhitelistStatus,
  getUserOnboardingProgress,
  hasCompletedOnboarding,
} from './actions';
import OnboardingFlow from './onboarding-flow';

export default async function OnboardingPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  // Check if user is whitelisted
  const whitelistStatus = await checkUserWhitelistStatus(user.id);

  // Check if user has completed onboarding
  const completedOnboarding = await hasCompletedOnboarding(user.id);

  if (completedOnboarding) {
    // If onboarding is complete, redirect to dashboard
    const defaultWorkspace = await getUserDefaultWorkspace();
    if (defaultWorkspace?.id) {
      redirect(`/${defaultWorkspace.id}`);
    } else {
      // If no workspace, restart onboarding
      // This shouldn't happen, but handle gracefully
    }
  }

  // Get current onboarding progress
  const progress = await getUserOnboardingProgress(user.id);

  return (
    <OnboardingFlow
      user={user}
      whitelistStatus={whitelistStatus}
      initialProgress={progress}
    />
  );
}
