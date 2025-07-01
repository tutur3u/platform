'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import {
  completeOnboardingStep,
  createWorkspaceFromOnboarding,
  updateOnboardingProgress,
} from '@tuturuuu/utils/onboarding-helper';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import ProfileCompletionScreen from './profile-completion-screen';
import type {
  OnboardingProgress,
  OnboardingStep,
  WhitelistStatus,
} from './types';
import { ONBOARDING_STEPS } from './types';
import { WaitlistScreen } from './waitlist-screen';
import { WelcomeScreen } from './welcome-screen';
import { WorkspaceSetupScreen } from './workspace-setup-screen';

interface OnboardingFlowProps {
  user: WorkspaceUser;
  whitelistStatus: WhitelistStatus;
  initialProgress: OnboardingProgress | null;
}

interface WorkspaceData {
  name: string | null;
  description?: string | null;
  avatarUrl?: string | null;
}

interface ProfileData {
  displayName: string;
  bio?: string;
  avatarUrl?: string;
}

export default function OnboardingFlow({
  user,
  whitelistStatus,
  initialProgress,
}: OnboardingFlowProps) {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(
    (initialProgress?.current_step ||
      ONBOARDING_STEPS.WELCOME) as OnboardingStep
  );
  const [loading, setLoading] = useState(false);
  const [workspaceData, setWorkspaceData] = useState<WorkspaceData | null>(
    initialProgress?.workspace_name
      ? {
          name: initialProgress.workspace_name,
          description: initialProgress.workspace_description,
          avatarUrl: initialProgress.workspace_avatar_url,
        }
      : null
  );
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [createdWorkspaceId, setCreatedWorkspaceId] = useState<string | null>(
    null
  );

  // If user is not whitelisted, show waitlist screen
  if (!whitelistStatus.is_whitelisted) {
    return <WaitlistScreen />;
  }

  const handleStepComplete = async (
    step: OnboardingStep,
    nextStep?: OnboardingStep
  ) => {
    setLoading(true);
    try {
      const success = await completeOnboardingStep(user.id, step, nextStep);
      if (success && nextStep) {
        setCurrentStep(nextStep);
      }
    } catch (error) {
      console.error('Error completing step:', error);
      toast({
        title: t('errors.title'),
        description: t('errors.save-progress'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleWelcomeComplete = () => {
    handleStepComplete(
      ONBOARDING_STEPS.WELCOME,
      ONBOARDING_STEPS.WORKSPACE_SETUP
    );
  };

  const handleWorkspaceSetup = async (data: WorkspaceData) => {
    setLoading(true);
    try {
      // Save workspace data to progress
      await updateOnboardingProgress(user.id, {
        workspace_name: data.name,
      });

      setWorkspaceData(data);

      // Create the workspace
      const result = await createWorkspaceFromOnboarding(
        user.id,
        data.name || ''
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to create workspace');
      }

      // Store the workspace ID for later use
      setCreatedWorkspaceId(result.workspaceId || null);

      await handleStepComplete(
        ONBOARDING_STEPS.WORKSPACE_SETUP,
        ONBOARDING_STEPS.PROFILE_COMPLETION
      );
    } catch (error) {
      console.error('Error creating workspace:', error);
      toast({
        title: t('errors.title'),
        description: t('errors.create-workspace'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleProfileCompletion = async (data: ProfileData) => {
    setLoading(true);
    try {
      // Update user profile via API
      const response = await fetch('/api/v1/user/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          display_name: data.displayName,
          bio: data.bio,
          avatar_url: data.avatarUrl,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to update profile');
      }

      setProfileData(data);

      // Mark profile as completed
      await updateOnboardingProgress(user.id, {
        profile_completed: true,
      });

      // Complete onboarding and redirect to dashboard
      await completeOnboardingStep(
        user.id,
        ONBOARDING_STEPS.PROFILE_COMPLETION
      );

      await completeOnboardingStep(
        user.id,
        ONBOARDING_STEPS.DASHBOARD_REDIRECT
      );

      // Redirect to the workspace that was created during onboarding
      if (createdWorkspaceId) {
        router.push(`/${createdWorkspaceId}`);
      } else {
        router.push('/');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      toast({
        title: t('errors.title'),
        description: t('errors.update-profile'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    switch (currentStep) {
      case ONBOARDING_STEPS.WORKSPACE_SETUP:
        setCurrentStep(ONBOARDING_STEPS.WELCOME);
        break;
      case ONBOARDING_STEPS.PROFILE_COMPLETION:
        setCurrentStep(ONBOARDING_STEPS.WORKSPACE_SETUP);
        break;
      default:
        break;
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingIndicator className="h-8 w-8" />
      </div>
    );
  }

  switch (currentStep) {
    case ONBOARDING_STEPS.WELCOME:
      return <WelcomeScreen onGetStarted={handleWelcomeComplete} />;

    case ONBOARDING_STEPS.WORKSPACE_SETUP:
      return (
        <WorkspaceSetupScreen
          onBack={handleBack}
          onContinue={handleWorkspaceSetup}
          initialData={workspaceData || undefined}
          loading={loading}
        />
      );

    case ONBOARDING_STEPS.PROFILE_COMPLETION:
      return (
        <ProfileCompletionScreen
          user={user}
          onBack={handleBack}
          onContinue={handleProfileCompletion}
          initialData={profileData || undefined}
          loading={loading}
        />
      );

    default:
      return <WelcomeScreen onGetStarted={handleWelcomeComplete} />;
  }
}
