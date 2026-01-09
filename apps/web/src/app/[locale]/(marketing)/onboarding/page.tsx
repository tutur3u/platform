import { mapUrlToApp } from '@tuturuuu/auth/cross-app';
import { createClient } from '@tuturuuu/supabase/next/server';
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

interface OnboardingPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

/**
 * Check if user has any non-personal workspaces
 */
async function hasNonPersonalWorkspaces(userId: string): Promise<boolean> {
  const supabase = await createClient();

  // Get all workspaces where user is a member
  const { data: memberWorkspaces } = await supabase
    .from('workspace_members')
    .select('ws_id, workspaces!inner(id, personal)')
    .eq('user_id', userId)
    .eq('workspaces.personal', false);

  if (!memberWorkspaces || memberWorkspaces.length === 0) {
    return false;
  }

  // Check if any workspace is not personal
  return memberWorkspaces.some(
    (m) => m.workspaces && !(m.workspaces as { personal: boolean }).personal
  );
}

export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
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

  // Extract redirect URLs from search params
  const params = await searchParams;
  const returnUrl = params.returnUrl as string | undefined;
  const nextUrl = params.nextUrl as string | undefined;

  // Determine if user came from an internal app (for auto-team flow)
  const isFromInternalApp = returnUrl ? !!mapUrlToApp(returnUrl) : false;

  // Check if user already has non-personal workspaces (skip use case step)
  const hasTeamWorkspaces = await hasNonPersonalWorkspaces(user.id);

  return (
    <OnboardingFlow
      user={user}
      initialProgress={progress}
      returnUrl={returnUrl}
      nextUrl={nextUrl}
      isFromInternalApp={isFromInternalApp}
      hasExistingTeamWorkspaces={hasTeamWorkspaces}
    />
  );
}
