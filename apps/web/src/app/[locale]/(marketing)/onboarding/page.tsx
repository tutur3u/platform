import {
  getCurrentUser,
  getUserDefaultWorkspace,
} from '@tuturuuu/utils/user-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUserOnboardingProgress, hasCompletedOnboarding } from './actions';
import OnboardingFlow from './onboarding-flow';

export const metadata: Metadata = {
  title: 'Onboarding with Tuturuuu',
  description: 'Guide new teammates through getting started with Tuturuuu.',
};

export default async function OnboardingPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

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

  const progress = await getUserOnboardingProgress(user.id);
  return <OnboardingFlow user={user} initialProgress={progress} />;
}
