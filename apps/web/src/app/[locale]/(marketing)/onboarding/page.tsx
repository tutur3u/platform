import { mapUrlToApp } from '@tuturuuu/auth/cross-app';
import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getCurrentUser,
  getUserDefaultWorkspace,
} from '@tuturuuu/utils/user-helper';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getOrCreatePolarCustomer } from '@/utils/customer-helper';
import { createFreeSubscription } from '@/utils/subscription-helper';
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
 * Ensure the user's personal workspace has a free subscription.
 * Best-effort: failures are logged but never block the onboarding flow.
 */
async function ensurePersonalWorkspaceSubscription(
  userId: string
): Promise<void> {
  try {
    const supabase = await createClient();

    // Find user's personal workspace
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id')
      .eq('creator_id', userId)
      .eq('personal', true)
      .maybeSingle();

    if (!workspace) return;

    // Use admin client to bypass RLS when checking subscriptions
    const sbAdmin = await createAdminClient();

    const { count } = await sbAdmin
      .from('workspace_subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('ws_id', workspace.id)
      .eq('status', 'active');

    if ((count ?? 0) > 0) return;

    // No active subscription — create one
    const polar = createPolarClient();
    await getOrCreatePolarCustomer({
      polar,
      supabase: sbAdmin,
      wsId: workspace.id,
    });
    await createFreeSubscription(polar, sbAdmin, workspace.id);

    console.log(
      `Onboarding: created free subscription for personal workspace ${workspace.id}`
    );
  } catch (error) {
    console.error(
      'Onboarding: failed to ensure personal workspace subscription:',
      error
    );
  }
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

  // Ensure the user's personal workspace has a free subscription.
  // This handles users redirected here by the proxy subscription check,
  // as well as users who onboarded before the subscription system existed.
  await ensurePersonalWorkspaceSubscription(user.id);

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
