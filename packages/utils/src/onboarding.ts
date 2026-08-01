import { LAUNCHABLE_APPS } from './launchable-apps';

export const ONBOARDING_PERSONAS = [
  'professional',
  'student',
  'founder',
  'executive',
  'team_leader',
  'educator',
  'creator',
  'developer',
  'operations',
] as const;

export const ONBOARDING_GOALS = [
  'focus',
  'collaborate',
  'operate',
  'learn',
  'build',
] as const;

export type OnboardingPersona = (typeof ONBOARDING_PERSONAS)[number];
export type OnboardingGoal = (typeof ONBOARDING_GOALS)[number];
export type OnboardingAppSlug = (typeof LAUNCHABLE_APPS)[number]['slug'];
export type OnboardingActionSafety =
  | 'preview'
  | 'reversible'
  | 'confirmation_required';

export type OnboardingMission = {
  appSlug: OnboardingAppSlug;
  capabilities: readonly [string, string, string];
  goal: OnboardingGoal;
  safety: OnboardingActionSafety;
};

export type OnboardingJourneyPreferences = {
  goals: OnboardingGoal[];
  persona: OnboardingPersona | null;
};

export type OnboardingJourneyProgress = OnboardingJourneyPreferences & {
  completedMissionIds: string[];
  dismissedAt: string | null;
  mode: 'standard' | 'employee_test';
  replayApp: OnboardingAppSlug | null;
  revision: number;
};

export const ONBOARDING_JOURNEY_REVISION = 2;

export const PERSONA_RECOMMENDATIONS = {
  professional: ['tasks', 'calendar', 'mail', 'drive', 'assistant'],
  student: ['learn', 'rewise', 'calendar', 'tasks', 'mind'],
  founder: ['tasks', 'finance', 'contacts', 'forms', 'assistant'],
  executive: ['platform', 'finance', 'calendar', 'meet', 'assistant'],
  team_leader: ['tasks', 'chat', 'calendar', 'meet', 'contacts'],
  educator: ['teach', 'learn', 'forms', 'meet', 'drive'],
  creator: ['cms', 'drive', 'shortener', 'forms', 'assistant'],
  developer: ['git', 'ai', 'docs', 'tasks', 'tools'],
  operations: ['inventory', 'finance', 'contacts', 'forms', 'tasks'],
} as const satisfies Record<OnboardingPersona, readonly string[]>;

export const GOAL_RECOMMENDATIONS = {
  focus: ['tasks', 'calendar', 'mail', 'track', 'assistant'],
  collaborate: ['chat', 'meet', 'drive', 'tasks', 'forms'],
  operate: ['finance', 'inventory', 'contacts', 'pay', 'storefront'],
  learn: ['learn', 'teach', 'rewise', 'mind', 'docs'],
  build: ['ai', 'git', 'cms', 'nova', 'tools'],
} as const satisfies Record<OnboardingGoal, readonly string[]>;

const MISSIONS = [
  ['platform', 'focus', 'reversible', ['overview', 'apps', 'next_move']],
  ['calendar', 'focus', 'reversible', ['schedule', 'timebox', 'review']],
  [
    'chat',
    'collaborate',
    'confirmation_required',
    ['spaces', 'message', 'follow_up'],
  ],
  ['cms', 'build', 'confirmation_required', ['content', 'preview', 'publish']],
  [
    'drive',
    'collaborate',
    'confirmation_required',
    ['organize', 'share', 'find'],
  ],
  ['git', 'build', 'preview', ['repositories', 'browse', 'search']],
  ['apps', 'focus', 'reversible', ['discover', 'filter', 'launch']],
  ['docs', 'learn', 'preview', ['browse', 'search', 'reference']],
  [
    'finance',
    'operate',
    'confirmation_required',
    ['wallets', 'transactions', 'reports'],
  ],
  ['hive', 'build', 'preview', ['world', 'simulate', 'observe']],
  [
    'inventory',
    'operate',
    'confirmation_required',
    ['catalog', 'stock', 'movement'],
  ],
  [
    'storefront',
    'operate',
    'confirmation_required',
    ['store', 'preview', 'checkout'],
  ],
  ['learn', 'learn', 'reversible', ['courses', 'study', 'progress']],
  ['mail', 'focus', 'confirmation_required', ['inbox', 'compose', 'follow_up']],
  ['meet', 'collaborate', 'confirmation_required', ['room', 'invite', 'meet']],
  ['mind', 'learn', 'reversible', ['canvas', 'connect', 'organize']],
  [
    'ai',
    'build',
    'confirmation_required',
    ['playground', 'models', 'evaluate'],
  ],
  ['nova', 'build', 'confirmation_required', ['challenge', 'prompt', 'submit']],
  ['tools', 'build', 'reversible', ['choose', 'configure', 'generate']],
  ['rewise', 'learn', 'reversible', ['material', 'practice', 'review']],
  ['shortener', 'build', 'reversible', ['link', 'customize', 'measure']],
  ['tasks', 'focus', 'reversible', ['capture', 'plan', 'complete']],
  ['teach', 'learn', 'confirmation_required', ['course', 'lesson', 'share']],
  ['pay', 'operate', 'confirmation_required', ['request', 'review', 'pay']],
  [
    'contacts',
    'operate',
    'confirmation_required',
    ['people', 'fields', 'follow_up'],
  ],
  [
    'forms',
    'collaborate',
    'confirmation_required',
    ['build', 'preview', 'share'],
  ],
  ['track', 'focus', 'reversible', ['timer', 'session', 'insights']],
] as const satisfies readonly (readonly [
  OnboardingAppSlug,
  OnboardingGoal,
  OnboardingActionSafety,
  readonly [string, string, string],
])[];

export const ONBOARDING_MISSIONS: readonly OnboardingMission[] = MISSIONS.map(
  ([appSlug, goal, safety, capabilities]) => ({
    appSlug,
    capabilities,
    goal,
    safety,
  })
);

export function getOnboardingMission(appSlug: string) {
  return ONBOARDING_MISSIONS.find((mission) => mission.appSlug === appSlug);
}

export function recommendOnboardingApps(
  preferences: OnboardingJourneyPreferences,
  limit = 8
): OnboardingAppSlug[] {
  const ranked = new Map<string, number>();
  const add = (slug: string, score: number) =>
    ranked.set(slug, (ranked.get(slug) ?? 0) + score);

  if (preferences.persona) {
    PERSONA_RECOMMENDATIONS[preferences.persona].forEach((slug, index) => {
      add(slug, 20 - index);
    });
  }

  preferences.goals.forEach((goal) => {
    GOAL_RECOMMENDATIONS[goal].forEach((slug, index) => {
      add(slug, 12 - index);
    });
  });

  const launchable = new Set(LAUNCHABLE_APPS.map((app) => app.slug));
  return [...ranked.entries()]
    .filter(([slug]) => launchable.has(slug as OnboardingAppSlug))
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([slug]) => slug as OnboardingAppSlug);
}

export function createDefaultOnboardingProgress(): OnboardingJourneyProgress {
  return {
    completedMissionIds: [],
    dismissedAt: null,
    goals: [],
    mode: 'standard',
    persona: null,
    replayApp: null,
    revision: ONBOARDING_JOURNEY_REVISION,
  };
}
