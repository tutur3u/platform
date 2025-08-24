'use client';

import ProfileCompletionScreen from './profile-completion-screen';
import type { OnboardingProgress, OnboardingStep } from './types';
import { ONBOARDING_STEPS } from './types';
import { WelcomeScreen } from './welcome-screen';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import {
  completeOnboardingStep,
  updateOnboardingProgress,
} from '@tuturuuu/utils/onboarding-helper';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface OnboardingFlowProps {
  user: WorkspaceUser;
  initialProgress: OnboardingProgress | null;
}

interface ProfileData {
  displayName: string;
  bio?: string;
  avatarUrl?: string;
}

export default function OnboardingFlow({
  user,
  initialProgress,
}: OnboardingFlowProps) {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(
    (initialProgress?.current_step ||
      ONBOARDING_STEPS.WELCOME) as OnboardingStep
  );
  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [createdWorkspaceId, setCreatedWorkspaceId] = useState<string | null>(
    null
  );

  const handleWelcomeComplete = async () => {
    setLoading(true);
    try {
      // Automatically create a personal workspace
      const response = await fetch('/api/v1/workspaces/personal', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to create personal workspace');
      }

      const result = await response.json();
      setCreatedWorkspaceId(result.id);

      // Complete welcome step
      await completeOnboardingStep(user.id, ONBOARDING_STEPS.WELCOME);

      // Mark workspace setup as completed (since we did it automatically)
      await completeOnboardingStep(
        user.id,
        ONBOARDING_STEPS.WORKSPACE_SETUP,
        ONBOARDING_STEPS.PROFILE_COMPLETION
      );

      // Update current step to profile completion
      setCurrentStep(ONBOARDING_STEPS.PROFILE_COMPLETION);
    } catch (error) {
      console.error('Error creating personal workspace:', error);
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

      // Complete the workspace setup step (which we did automatically)
      await completeOnboardingStep(user.id, ONBOARDING_STEPS.WORKSPACE_SETUP);

      // Complete profile step
      await completeOnboardingStep(
        user.id,
        ONBOARDING_STEPS.PROFILE_COMPLETION
      );

      // Complete onboarding
      await completeOnboardingStep(
        user.id,
        ONBOARDING_STEPS.DASHBOARD_REDIRECT
      );

      // Redirect to the personal workspace
      if (createdWorkspaceId) {
        router.push(`/${createdWorkspaceId}`);
      } else {
        // Fallback to personal workspace
        router.push('/personal');
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
      case ONBOARDING_STEPS.PROFILE_COMPLETION:
        setCurrentStep(ONBOARDING_STEPS.WELCOME);
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
