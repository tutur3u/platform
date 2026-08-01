'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  Code2,
  Crown,
  GraduationCap,
  Palette,
  Rocket,
  School,
  Sparkles,
  Users,
  Wrench,
  X,
} from '@tuturuuu/icons';
import {
  getConnectedOnboardingProgress,
  updateConnectedOnboardingProgress,
} from '@tuturuuu/internal-api/onboarding';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import {
  getLaunchableApp,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';
import {
  createDefaultOnboardingProgress,
  ONBOARDING_GOALS,
  ONBOARDING_JOURNEY_REVISION,
  ONBOARDING_PERSONAS,
  type OnboardingGoal,
  type OnboardingJourneyProgress,
  type OnboardingPersona,
  recommendOnboardingApps,
} from '@tuturuuu/utils/onboarding';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ComponentType, useState } from 'react';

const progressKey = ['connected-onboarding'] as const;

const PERSONA_ICONS: Record<
  OnboardingPersona,
  ComponentType<{ className?: string }>
> = {
  professional: BriefcaseBusiness,
  student: GraduationCap,
  founder: Rocket,
  executive: Crown,
  team_leader: Users,
  educator: School,
  creator: Palette,
  developer: Code2,
  operations: Wrench,
};

function normalizeProgress(
  value: Awaited<ReturnType<typeof getConnectedOnboardingProgress>> | undefined
): OnboardingJourneyProgress {
  const fallback = createDefaultOnboardingProgress();
  const persona = ONBOARDING_PERSONAS.includes(
    value?.persona as OnboardingPersona
  )
    ? (value?.persona as OnboardingPersona)
    : null;
  const goals = (value?.goals ?? []).filter((goal): goal is OnboardingGoal =>
    ONBOARDING_GOALS.includes(goal as OnboardingGoal)
  );

  return {
    ...fallback,
    completedMissionIds: value?.completed_missions ?? [],
    dismissedAt: value?.dismissed_at ?? null,
    goals,
    mode:
      value?.guidance_mode === 'employee_test' ? 'employee_test' : 'standard',
    persona,
    replayApp: null,
    revision: value?.journey_revision ?? ONBOARDING_JOURNEY_REVISION,
  };
}

function GoalPathwayMap({ selected }: { selected: OnboardingGoal[] }) {
  const t = useTranslations('connected-onboarding');

  return (
    <div className="relative grid min-h-72 place-items-center overflow-hidden rounded-3xl border bg-muted/20 p-5">
      <div className="absolute inset-8 rounded-full border border-foreground/15 border-dashed" />
      <div className="absolute inset-20 rounded-full border border-foreground/10" />
      <div className="relative z-10 grid w-full grid-cols-3 items-center gap-4">
        {ONBOARDING_GOALS.map((goal, index) => (
          <div
            key={goal}
            className={cn(
              'rounded-2xl border bg-background/90 p-3 text-center shadow-sm backdrop-blur',
              selected.includes(goal) && 'border-primary bg-primary/5',
              index === 0 && 'col-start-2',
              index === 1 && 'col-start-1',
              index === 2 && 'col-start-3',
              index === 3 && 'col-start-1',
              index === 4 && 'col-start-3'
            )}
          >
            <p className="font-medium text-sm">{t(`goals.${goal}.title`)}</p>
            <p className="mt-1 text-muted-foreground text-xs">
              {t(`goals.${goal}.short`)}
            </p>
          </div>
        ))}
        <div className="absolute top-1/2 left-1/2 flex size-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border bg-background shadow-lg">
          <Sparkles className="mb-1 size-5" />
          <span className="font-semibold text-xs">Tuturuuu</span>
        </div>
      </div>
    </div>
  );
}

export function ConnectedHome({
  canTest,
  userName,
  workspace,
}: {
  canTest: boolean;
  userName: string | null;
  workspace: { id: string; name?: string | null; personal?: boolean | null };
}) {
  const t = useTranslations('connected-onboarding');
  const queryClient = useQueryClient();
  const progressQuery = useQuery({
    queryKey: progressKey,
    queryFn: () => getConnectedOnboardingProgress(),
    staleTime: 60_000,
  });
  const progress = normalizeProgress(progressQuery.data);
  const displayName = userName || t('friend');
  const [testPersona, setTestPersona] = useState<OnboardingPersona | null>(
    null
  );
  const [testGoals, setTestGoals] = useState<OnboardingGoal[]>([]);
  const effectivePersona =
    progress.mode === 'employee_test' ? testPersona : progress.persona;
  const effectiveGoals =
    progress.mode === 'employee_test' ? testGoals : progress.goals;
  const updateMutation = useMutation({
    mutationFn: (
      payload: Parameters<typeof updateConnectedOnboardingProgress>[0]
    ) => updateConnectedOnboardingProgress(payload),
    onSuccess: (data) => queryClient.setQueryData(progressKey, data),
  });
  const update = (
    next: Parameters<typeof updateConnectedOnboardingProgress>[0]
  ) => updateMutation.mutate(next);
  const recommendedApps = recommendOnboardingApps({
    goals: effectiveGoals,
    persona: effectivePersona,
  });
  const visibleApps = recommendedApps.length
    ? recommendedApps
    : (['tasks', 'calendar', 'drive', 'finance', 'learn', 'ai'] as const);
  const showPersonalization =
    progress.mode === 'employee_test' || !progress.dismissedAt;

  const toggleGoal = (goal: OnboardingGoal) => {
    const goals = effectiveGoals.includes(goal)
      ? effectiveGoals.filter((item) => item !== goal)
      : [...effectiveGoals, goal];
    if (progress.mode === 'employee_test') {
      setTestGoals(goals);
      return;
    }
    update({ goals, journey_revision: ONBOARDING_JOURNEY_REVISION });
  };

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 pb-12">
      <section className="relative overflow-hidden rounded-3xl border bg-card px-5 py-8 shadow-sm sm:px-8 lg:px-10">
        <div className="absolute -top-24 -right-16 size-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs">
              <Sparkles className="size-3.5" />
              {t('eyebrow')}
            </div>
            <h1 className="max-w-3xl text-balance font-semibold text-3xl tracking-tight sm:text-5xl">
              {progress.persona
                ? t('welcome_back', { name: displayName })
                : t('welcome', { name: displayName })}
            </h1>
            <p className="mt-4 max-w-2xl text-balance text-muted-foreground sm:text-lg">
              {progress.persona ? t('adaptive_subtitle') : t('subtitle')}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild>
                <Link
                  href={`/${workspace.personal ? 'personal' : workspace.id}/assistant`}
                >
                  {t('ask_mira')}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              {showPersonalization && (
                <Button
                  variant="outline"
                  onClick={() =>
                    update({ dismissed_at: new Date().toISOString() })
                  }
                >
                  <X className="size-4" />
                  {t('dismiss_for_now')}
                </Button>
              )}
              {canTest && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    update({
                      guidance_mode:
                        progress.mode === 'employee_test'
                          ? 'standard'
                          : 'employee_test',
                    })
                  }
                >
                  {progress.mode === 'employee_test'
                    ? t('leave_test_mode')
                    : t('enter_test_mode')}
                </Button>
              )}
            </div>
          </div>
          <GoalPathwayMap selected={effectiveGoals} />
        </div>
      </section>

      {showPersonalization && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="font-medium text-primary text-sm">
                {t('role_eyebrow')}
              </p>
              <h2 className="mt-1 font-semibold text-2xl tracking-tight">
                {t('choose_role')}
              </h2>
            </div>
            <p className="hidden max-w-md text-right text-muted-foreground text-sm md:block">
              {t('role_privacy')}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-9">
            {ONBOARDING_PERSONAS.map((persona) => {
              const Icon = PERSONA_ICONS[persona];
              const active = effectivePersona === persona;
              return (
                <button
                  key={persona}
                  type="button"
                  onClick={() => {
                    if (progress.mode === 'employee_test') {
                      setTestPersona(persona);
                      return;
                    }
                    update({
                      journey_revision: ONBOARDING_JOURNEY_REVISION,
                      persona,
                    });
                  }}
                  className={cn(
                    'group min-h-28 rounded-2xl border bg-card p-3 text-left transition hover:-translate-y-0.5 hover:shadow-md',
                    active && 'border-primary bg-primary/5'
                  )}
                >
                  <div className="flex items-start justify-between">
                    <Icon className="size-5" />
                    {active && <Check className="size-4 text-primary" />}
                  </div>
                  <p className="mt-5 font-medium text-sm">
                    {t(`personas.${persona}`)}
                  </p>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section
        className={cn(
          'grid gap-6',
          showPersonalization && 'lg:grid-cols-[0.7fr_1.3fr]'
        )}
      >
        {showPersonalization && (
          <div className="rounded-3xl border bg-card p-5 sm:p-6">
            <p className="font-medium text-primary text-sm">
              {t('goal_eyebrow')}
            </p>
            <h2 className="mt-1 font-semibold text-2xl tracking-tight">
              {t('choose_goals')}
            </h2>
            <div className="mt-5 space-y-2">
              {ONBOARDING_GOALS.map((goal) => {
                const active = effectiveGoals.includes(goal);
                return (
                  <button
                    key={goal}
                    type="button"
                    onClick={() => toggleGoal(goal)}
                    className={cn(
                      'flex w-full items-center justify-between rounded-xl border p-3 text-left transition hover:bg-muted/50',
                      active && 'border-primary bg-primary/5'
                    )}
                  >
                    <span>
                      <span className="block font-medium text-sm">
                        {t(`goals.${goal}.title`)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {t(`goals.${goal}.description`)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'grid size-6 place-items-center rounded-full border',
                        active &&
                          'border-primary bg-primary text-primary-foreground'
                      )}
                    >
                      {active && <Check className="size-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-3xl border bg-card p-5 sm:p-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-medium text-primary text-sm">
                {t('apps_eyebrow')}
              </p>
              <h2 className="mt-1 font-semibold text-2xl tracking-tight">
                {t('recommended_apps')}
              </h2>
            </div>
            <span className="text-muted-foreground text-xs">
              {t('recommendation_note')}
            </span>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleApps.map((slug) => {
              const app = getLaunchableApp(slug);
              if (!app) return null;
              const href = resolveLaunchableAppUrl({ app, workspace });
              return (
                <Link
                  key={slug}
                  href={href}
                  className="group rounded-2xl border bg-background p-4 transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{app.title}</span>
                    <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-2 text-muted-foreground text-sm">
                    {t('guided_mission')}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
