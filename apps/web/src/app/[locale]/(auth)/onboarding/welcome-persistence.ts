import {
  type ConnectedOnboardingUpdate,
  getUserConfig,
  updateAccountNotificationPreferences,
  updateConnectedOnboardingProgress,
  updateUserConfig,
} from '@tuturuuu/internal-api';
import {
  AUDIENCE_MODE_CONFIG_ID,
  EDUCATION_AUDIENCE_MODE,
  goalsFromInterests,
  type InterestId,
  PRODUCT_NEWS_CHANNEL,
  PRODUCT_NEWS_EVENT,
  type WelcomeScreen,
  type WelcomeStep,
} from './welcome-model';

/**
 * Every write goes through an existing API: the onboarding-progress PATCH, the
 * account notification preferences and the user config. Nothing here adds a
 * route or a column.
 */

export function saveProgress(update: ConnectedOnboardingUpdate) {
  return updateConnectedOnboardingProgress(update);
}

/**
 * Records where the person is. A skipped step moves on without joining
 * `completed`; reaching the closing screen completes the flow.
 */
export function saveStepPosition(input: {
  completed: readonly WelcomeStep[];
  next: WelcomeScreen;
  teamWorkspaceId?: string;
}) {
  return saveProgress({
    completed_steps: [...input.completed],
    current_step: input.next,
    ...(input.teamWorkspaceId
      ? { team_workspace_id: input.teamWorkspaceId }
      : {}),
    ...(input.next === 'done'
      ? { completed_at: new Date().toISOString() }
      : {}),
  });
}

/** Skipping the whole flow retires it; the account keeps its workspace. */
export function saveFlowSkipped() {
  return saveProgress({ dismissed_at: new Date().toISOString() });
}

export function saveAppearanceAndLanguage(input: {
  language: string;
  theme: string;
}) {
  return saveProgress({
    language_preference: input.language,
    theme_preference: input.theme,
  });
}

/** Stores the picked interests as journey goals; an empty pick changes nothing. */
export async function saveInterests(interests: readonly InterestId[]) {
  if (interests.length === 0) return;
  await saveProgress({ goals: goalsFromInterests(interests) });
  if (interests.includes('education')) await adoptEducationAudience();
}

/** Teach or learn selects the education audience mode, unless one is set. */
async function adoptEducationAudience() {
  const current = await getUserConfig(AUDIENCE_MODE_CONFIG_ID).catch(
    () => null
  );
  if (current?.value) return;
  await updateUserConfig(AUDIENCE_MODE_CONFIG_ID, EDUCATION_AUDIENCE_MODE);
}

/**
 * Writes the "Product news by email" choice explicitly, off included: with no
 * stored row the notification check defaults to enabled, so a stored `false`
 * is what keeps the switch's promise.
 */
export function saveProductNews(enabled: boolean) {
  return updateAccountNotificationPreferences([
    {
      channel: PRODUCT_NEWS_CHANNEL,
      enabled,
      eventType: PRODUCT_NEWS_EVENT,
    },
  ]);
}
