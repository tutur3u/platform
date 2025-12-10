'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { toast } from '@tuturuuu/ui/sonner';
import { AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { OnboardingProgress } from './components/progress/onboarding-progress';
import { CelebrationScreen } from './components/screens/celebration-screen';
import { PreferencesScreen } from './components/screens/preferences-screen';
import { ProfileScreen } from './components/screens/profile-screen';
import { TeamInviteScreen } from './components/screens/team-invite-screen';
import { TeamWorkspaceScreen } from './components/screens/team-workspace-screen';
import { UseCaseScreen } from './components/screens/use-case-screen';
import type {
  FlowType,
  OnboardingProgress as OnboardingProgressType,
  OnboardingStep,
  PreferencesData,
  ProfileData,
  TeamWorkspaceData,
  UseCase,
} from './types';
import {
  FLOW_TYPES,
  getFlowTypeFromUseCase,
  getPreviousStep,
  ONBOARDING_STEPS,
} from './types';
import { WelcomeScreen } from './welcome-screen';

interface OnboardingFlowProps {
  user: WorkspaceUser;
  initialProgress: OnboardingProgressType | null;
}

export default function OnboardingFlow({
  user,
  initialProgress,
}: OnboardingFlowProps) {
  const t = useTranslations('onboarding');
  const router = useRouter();

  // State management
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(
    (initialProgress?.current_step as OnboardingStep) ||
      ONBOARDING_STEPS.WELCOME
  );
  const [flowType, setFlowType] = useState<FlowType>(
    (initialProgress?.flow_type as FlowType) || FLOW_TYPES.PERSONAL
  );
  const [completedSteps, setCompletedSteps] = useState<string[]>(
    initialProgress?.completed_steps || []
  );
  const [loading, setLoading] = useState(false);

  // Collected data
  const [useCase, setUseCase] = useState<UseCase | null>(
    (initialProgress?.use_case as UseCase) || null
  );
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [teamWorkspaceData, setTeamWorkspaceData] =
    useState<TeamWorkspaceData | null>(
      initialProgress?.workspace_name
        ? {
            name: initialProgress.workspace_name,
          }
        : null
    );
  const [invitedEmails, setInvitedEmails] = useState<string[]>(
    initialProgress?.invited_emails || []
  );
  const [preferencesData, setPreferencesData] =
    useState<PreferencesData | null>(null);

  // Workspace IDs
  const [personalWorkspaceId, setPersonalWorkspaceId] = useState<string | null>(
    null
  );
  const [teamWorkspaceId, setTeamWorkspaceId] = useState<string | null>(
    initialProgress?.team_workspace_id || null
  );

  // Fetch user's personal workspace ID on mount (for resuming onboarding)
  useEffect(() => {
    const fetchPersonalWorkspace = async () => {
      try {
        const response = await fetch('/api/v1/workspaces/personal', {
          method: 'POST',
        });
        if (response.ok) {
          const data = await response.json();
          // The API returns { id, existing: true } if workspace already exists
          setPersonalWorkspaceId(data.id);
        }
      } catch (error) {
        console.error('Error fetching personal workspace:', error);
      }
    };

    // Only fetch if we're past the welcome step (meaning workspace should exist)
    if (currentStep !== ONBOARDING_STEPS.WELCOME && !personalWorkspaceId) {
      fetchPersonalWorkspace();
    }
  }, [currentStep, personalWorkspaceId]);

  // Navigate to next step
  const goToNextStep = useCallback(
    (step: OnboardingStep) => {
      setCompletedSteps((prev) =>
        prev.includes(currentStep) ? prev : [...prev, currentStep]
      );
      setCurrentStep(step);
    },
    [currentStep]
  );

  // Navigate to previous step
  const goToPreviousStep = useCallback(() => {
    const prevStep = getPreviousStep(currentStep, flowType);
    if (prevStep) {
      setCurrentStep(prevStep);
    }
  }, [currentStep, flowType]);

  // Update progress on server
  const updateProgress = async (updates: Partial<OnboardingProgressType>) => {
    try {
      await fetch('/api/v1/user/onboarding-progress', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
    } catch (error) {
      console.error('Failed to update progress:', error);
    }
  };

  // Handle welcome completion - create personal workspace
  const handleWelcomeComplete = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/workspaces/personal', {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (
          response.status === 403 &&
          errorData.code === 'WORKSPACE_LIMIT_REACHED'
        ) {
          toast.error(t('errors.workspace-limit-title'), {
            description: errorData.message,
          });
          return;
        }
        throw new Error(
          errorData.message || 'Failed to create personal workspace'
        );
      }

      const result = await response.json();
      setPersonalWorkspaceId(result.id);

      await updateProgress({
        current_step: ONBOARDING_STEPS.USE_CASE,
        completed_steps: [...completedSteps, ONBOARDING_STEPS.WELCOME],
      });

      goToNextStep(ONBOARDING_STEPS.USE_CASE);
    } catch (error) {
      console.error('Error creating personal workspace:', error);
      toast.error(t('errors.title'), {
        description: t('errors.create-workspace'),
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle use case selection
  const handleUseCaseSelect = async (selectedUseCase: UseCase) => {
    setLoading(true);
    try {
      setUseCase(selectedUseCase);
      const newFlowType = getFlowTypeFromUseCase(selectedUseCase);
      setFlowType(newFlowType);

      await updateProgress({
        use_case: selectedUseCase,
        flow_type: newFlowType,
        current_step: ONBOARDING_STEPS.PROFILE,
        completed_steps: [...completedSteps, ONBOARDING_STEPS.USE_CASE],
      });

      goToNextStep(ONBOARDING_STEPS.PROFILE);
    } catch (error) {
      console.error('Error saving use case:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle profile completion
  const handleProfileComplete = async (data: ProfileData) => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: data.displayName,
          bio: data.bio,
          avatar_url: data.avatarUrl,
        }),
      });

      if (!response.ok) throw new Error('Failed to update profile');

      setProfileData(data);

      const nextStep =
        flowType === FLOW_TYPES.TEAM
          ? ONBOARDING_STEPS.TEAM_WORKSPACE
          : ONBOARDING_STEPS.PREFERENCES;

      await updateProgress({
        profile_completed: true,
        current_step: nextStep,
        completed_steps: [...completedSteps, ONBOARDING_STEPS.PROFILE],
      });

      goToNextStep(nextStep);
    } catch (error) {
      console.error('Error updating profile:', error);
      toast.error(t('errors.title'), {
        description: t('errors.update-profile'),
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle team workspace creation
  const handleTeamWorkspaceComplete = async (data: TeamWorkspaceData) => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/workspaces/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          avatar_url: data.avatarUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to create team workspace');
      }

      const result = await response.json();
      setTeamWorkspaceId(result.id);
      setTeamWorkspaceData(data);

      await updateProgress({
        team_workspace_id: result.id,
        workspace_name: data.name,
        current_step: ONBOARDING_STEPS.TEAM_INVITE,
        completed_steps: [...completedSteps, ONBOARDING_STEPS.TEAM_WORKSPACE],
      });

      goToNextStep(ONBOARDING_STEPS.TEAM_INVITE);
    } catch (error) {
      console.error('Error creating team workspace:', error);
      toast.error(t('errors.title'), {
        description: t('errors.workspace-creation-failed'),
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle team invites
  const handleTeamInviteComplete = async (emails: string[]) => {
    setLoading(true);
    try {
      if (emails.length > 0 && teamWorkspaceId) {
        const response = await fetch(
          `/api/v1/workspaces/${teamWorkspaceId}/members/batch-invite`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emails }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          toast.warning(t('errors.invite-partial'), {
            description: errorData.message,
          });
        } else {
          const result = await response.json();
          toast.success(
            t('team-invite.invites-sent', { count: result.successCount })
          );
        }
      }

      setInvitedEmails(emails);

      await updateProgress({
        invited_emails: emails,
        current_step: ONBOARDING_STEPS.PREFERENCES,
        completed_steps: [...completedSteps, ONBOARDING_STEPS.TEAM_INVITE],
      });

      goToNextStep(ONBOARDING_STEPS.PREFERENCES);
    } catch (error) {
      console.error('Error sending invites:', error);
      toast.error(t('errors.title'), {
        description: t('errors.invite-failed'),
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle preferences
  const handlePreferencesComplete = async (data: PreferencesData) => {
    setLoading(true);
    try {
      setPreferencesData(data);

      await updateProgress({
        theme_preference: data.theme,
        language_preference: data.language,
        notifications_enabled: data.notificationsEnabled,
        current_step: ONBOARDING_STEPS.CELEBRATION,
        completed_steps: [...completedSteps, ONBOARDING_STEPS.PREFERENCES],
      });

      goToNextStep(ONBOARDING_STEPS.CELEBRATION);
    } catch (error) {
      console.error('Error saving preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  // Handle preferences skip
  const handlePreferencesSkip = async () => {
    await updateProgress({
      current_step: ONBOARDING_STEPS.CELEBRATION,
      completed_steps: [...completedSteps, ONBOARDING_STEPS.PREFERENCES],
    });
    goToNextStep(ONBOARDING_STEPS.CELEBRATION);
  };

  // Handle team invite skip
  const handleTeamInviteSkip = async () => {
    await updateProgress({
      current_step: ONBOARDING_STEPS.PREFERENCES,
      completed_steps: [...completedSteps, ONBOARDING_STEPS.TEAM_INVITE],
    });
    goToNextStep(ONBOARDING_STEPS.PREFERENCES);
  };

  // Handle celebration complete - redirect to dashboard
  const handleCelebrationComplete = async () => {
    setLoading(true);
    try {
      await updateProgress({
        completed_at: new Date().toISOString(),
        completed_steps: [...completedSteps, ONBOARDING_STEPS.CELEBRATION],
      });

      // Determine the default workspace based on user's choice
      // If they created a team workspace, use that; otherwise use personal
      const defaultWorkspaceId = teamWorkspaceId || personalWorkspaceId;

      // Set the default workspace preference
      if (defaultWorkspaceId) {
        try {
          await fetch('/api/v1/users/me/default-workspace', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspaceId: defaultWorkspaceId }),
          });
        } catch (error) {
          console.error('Error setting default workspace:', error);
          // Don't fail onboarding for this
        }
      }

      // Redirect to team workspace if created, otherwise personal workspace
      const redirectId = teamWorkspaceId || personalWorkspaceId || 'personal';
      router.push(`/${redirectId}`);
    } catch (error) {
      console.error('Error completing onboarding:', error);
      router.push('/personal');
    }
  };

  // Loading state
  if (loading && currentStep === ONBOARDING_STEPS.WELCOME) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingIndicator className="h-8 w-8" />
      </div>
    );
  }

  // Render current step
  const renderStep = () => {
    switch (currentStep) {
      case ONBOARDING_STEPS.WELCOME:
        return (
          <WelcomeScreen
            key="welcome"
            onGetStarted={handleWelcomeComplete}
            loading={loading}
          />
        );

      case ONBOARDING_STEPS.USE_CASE:
        return (
          <UseCaseScreen
            key="use-case"
            onContinue={handleUseCaseSelect}
            onBack={goToPreviousStep}
            initialValue={useCase}
            loading={loading}
          />
        );

      case ONBOARDING_STEPS.PROFILE:
        return (
          <ProfileScreen
            key="profile"
            user={user}
            onContinue={handleProfileComplete}
            onBack={goToPreviousStep}
            initialData={profileData || undefined}
            loading={loading}
          />
        );

      case ONBOARDING_STEPS.TEAM_WORKSPACE:
        return (
          <TeamWorkspaceScreen
            key="team-workspace"
            onContinue={handleTeamWorkspaceComplete}
            onBack={goToPreviousStep}
            initialData={teamWorkspaceData || undefined}
            loading={loading}
          />
        );

      case ONBOARDING_STEPS.TEAM_INVITE:
        return (
          <TeamInviteScreen
            key="team-invite"
            onContinue={handleTeamInviteComplete}
            onBack={goToPreviousStep}
            onSkip={handleTeamInviteSkip}
            initialEmails={invitedEmails}
            loading={loading}
          />
        );

      case ONBOARDING_STEPS.PREFERENCES:
        return (
          <PreferencesScreen
            key="preferences"
            onContinue={handlePreferencesComplete}
            onBack={goToPreviousStep}
            onSkip={handlePreferencesSkip}
            initialData={preferencesData || undefined}
            loading={loading}
          />
        );

      case ONBOARDING_STEPS.CELEBRATION:
        return (
          <CelebrationScreen
            key="celebration"
            onContinue={handleCelebrationComplete}
            profileName={profileData?.displayName}
            workspaceName={teamWorkspaceData?.name}
            inviteCount={invitedEmails.length}
            hasPreferences={!!preferencesData}
          />
        );

      default:
        return (
          <WelcomeScreen
            key="welcome-default"
            onGetStarted={handleWelcomeComplete}
            loading={loading}
          />
        );
    }
  };

  return (
    <div className="relative min-h-[calc(100vh-53px)]">
      {/* Progress indicator - hidden on welcome and celebration */}
      {currentStep !== ONBOARDING_STEPS.WELCOME &&
        currentStep !== ONBOARDING_STEPS.CELEBRATION && (
          <div className="border-b px-4 py-4">
            <div className="mx-auto max-w-3xl">
              <OnboardingProgress
                currentStep={currentStep}
                completedSteps={completedSteps}
                flowType={flowType}
              />
            </div>
          </div>
        )}

      {/* Main content */}
      <AnimatePresence mode="wait" initial={false}>
        {renderStep()}
      </AnimatePresence>
    </div>
  );
}
