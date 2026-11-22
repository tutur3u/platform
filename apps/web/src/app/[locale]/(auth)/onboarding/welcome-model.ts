import type { OnboardingGoal } from '@tuturuuu/utils/onboarding';

/** The three screens the person can fill in, then the closing screen. */
export const WELCOME_STEPS = ['profile', 'space', 'interests'] as const;
export type WelcomeStep = (typeof WELCOME_STEPS)[number];
export type WelcomeScreen = WelcomeStep | 'done';

/** `?step=` lets a language switch return to the screen the person was on. */
export function parseWelcomeStep(value: string | null | undefined) {
  return WELCOME_STEPS.find((step) => step === value) ?? WELCOME_STEPS[0];
}

export function nextWelcomeScreen(step: WelcomeStep): WelcomeScreen {
  const index = WELCOME_STEPS.indexOf(step);
  return WELCOME_STEPS[index + 1] ?? 'done';
}

export function previousWelcomeStep(step: WelcomeStep): WelcomeStep | null {
  const index = WELCOME_STEPS.indexOf(step);
  return index > 0 ? (WELCOME_STEPS[index - 1] ?? null) : null;
}

export const INTEREST_IDS = [
  'calendar',
  'tasks',
  'chat',
  'education',
  'finance',
  'mira',
] as const;
export type InterestId = (typeof INTEREST_IDS)[number];

/** Chip colours are token roles, never hard-coded hues. */
export const INTEREST_CHIP_CLASS: Record<InterestId, string> = {
  calendar: 'bg-calendar-bg-blue text-dynamic-blue',
  chat: 'bg-calendar-bg-orange text-dynamic-orange',
  education: 'bg-calendar-bg-pink text-dynamic-pink',
  finance: 'bg-calendar-bg-gray text-dynamic-gray',
  mira: 'bg-calendar-bg-purple text-dynamic-purple',
  tasks: 'bg-calendar-bg-green text-dynamic-green',
};

/**
 * The progress row has no column for individual interests, so each tile maps
 * onto the existing journey goal that drives app recommendations.
 */
const INTEREST_GOAL: Record<InterestId, OnboardingGoal> = {
  calendar: 'focus',
  chat: 'collaborate',
  education: 'learn',
  finance: 'operate',
  mira: 'focus',
  tasks: 'focus',
};

export function goalsFromInterests(
  interests: readonly InterestId[]
): OnboardingGoal[] {
  return [...new Set(interests.map((interest) => INTEREST_GOAL[interest]))];
}

/** The mobile app's account-level audience mode; the web only writes it. */
export const AUDIENCE_MODE_CONFIG_ID = 'MOBILE_AUDIENCE_MODE';
export const EDUCATION_AUDIENCE_MODE = 'education';

export type WelcomeTheme = 'light' | 'dark' | 'system';
export const WELCOME_THEMES: readonly WelcomeTheme[] = [
  'light',
  'dark',
  'system',
];

export const WORKSPACE_LIMIT_CODE = 'WORKSPACE_LIMIT_REACHED';
