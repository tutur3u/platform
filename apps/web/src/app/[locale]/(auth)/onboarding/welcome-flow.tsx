'use client';

import { useMutation } from '@tanstack/react-query';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { type Locale, useRouter } from '@/i18n/routing';
import type { JoinedWorkspace } from './space-invites';
import { type SpaceDraft, StepSpace } from './step-space';
import { StepInterests } from './step-interests';
import { type ProfileDraft, StepProfile } from './step-profile';
import { WelcomeDone } from './welcome-done';
import {
  type InterestId,
  nextWelcomeScreen,
  previousWelcomeStep,
  type WelcomeScreen,
  type WelcomeStep,
} from './welcome-model';
import { saveFlowSkipped, saveStepPosition } from './welcome-persistence';
import { WelcomeShell } from './welcome-shell';

export type WelcomeFlowProps = {
  avatarUser: WorkspaceUser;
  calendarOrigin: string;
  displayName: string;
  /** Steps already saved, so a remount (a language switch) never loses them. */
  initialCompleted?: readonly string[];
  initialStep: WelcomeStep;
  tasksOrigin: string;
};

/**
 * The three-step welcome. Every step and the whole flow can be skipped, none
 * of it gates the app, and progress saves through existing APIs only.
 */
export function WelcomeFlow(props: WelcomeFlowProps) {
  const t = useTranslations('onboarding_flow');
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [screen, setScreen] = useState<WelcomeScreen>(props.initialStep);
  const [completed, setCompleted] = useState<string[]>(() => [
    ...new Set(props.initialCompleted ?? []),
  ]);
  const [profile, setProfile] = useState<ProfileDraft>({
    language: locale,
    name: props.displayName,
  });
  const [space, setSpace] = useState<SpaceDraft>({
    emails: [],
    mode: 'solo',
    name: '',
  });
  const [created, setCreated] = useState<JoinedWorkspace | null>(null);
  const [joined, setJoined] = useState<JoinedWorkspace | null>(null);
  const [interests, setInterests] = useState<InterestId[]>([]);

  const destination = created ?? joined;
  const workspaceSlug = destination?.id ?? 'personal';

  /** Records the position; a failed save never traps the person on a step. */
  const advance = async (
    step: WelcomeStep,
    options: { skipped?: boolean; teamWorkspaceId?: string } = {}
  ) => {
    const nextCompleted =
      options.skipped || completed.includes(step)
        ? completed
        : [...completed, step];
    await saveStepPosition({
      completed: nextCompleted,
      next: nextWelcomeScreen(step),
      teamWorkspaceId: options.teamWorkspaceId,
    }).catch((failure) => console.error('Failed to save progress:', failure));
    setCompleted(nextCompleted);
    setScreen(nextWelcomeScreen(step));
  };

  const skipStep = useMutation({
    mutationFn: async (step: WelcomeStep) => {
      await advance(step, { skipped: true });
    },
  });

  const skipFlow = useMutation({
    mutationFn: async () => {
      await saveFlowSkipped();
    },
    // Skipping must always lead into the app, even if the save failed.
    onSettled: () => router.push(`/${workspaceSlug}`),
  });

  if (screen === 'done') {
    return (
      <WelcomeDone
        calendarOrigin={props.calendarOrigin}
        name={profile.name.trim().split(/\s+/u)[0] ?? ''}
        tasksOrigin={props.tasksOrigin}
        workspaceName={destination?.name ?? null}
        workspaceSlug={workspaceSlug}
      />
    );
  }

  const previous = previousWelcomeStep(screen);
  const busy = skipStep.isPending || skipFlow.isPending;

  return (
    <WelcomeShell
      busy={busy}
      footer={
        <button
          className="mx-auto inline-flex min-h-11 items-center rounded-full px-3 text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-50"
          disabled={busy}
          onClick={() => skipFlow.mutate()}
          type="button"
        >
          {t('skip_setup')}
        </button>
      }
      onBack={previous ? () => setScreen(previous) : null}
      onSkip={() => skipStep.mutate(screen)}
      step={screen}
    >
      {screen === 'profile' ? (
        <StepProfile
          avatarUser={props.avatarUser}
          draft={profile}
          initialName={props.displayName}
          onAdvance={() => advance('profile')}
          onChange={setProfile}
        />
      ) : null}
      {screen === 'space' ? (
        <StepSpace
          created={created}
          draft={space}
          onAdvance={(teamWorkspaceId) => advance('space', { teamWorkspaceId })}
          onChange={setSpace}
          onCreated={setCreated}
          onJoined={setJoined}
        />
      ) : null}
      {screen === 'interests' ? (
        <StepInterests
          interests={interests}
          onAdvance={() => advance('interests')}
          onChange={setInterests}
        />
      ) : null}
    </WelcomeShell>
  );
}
