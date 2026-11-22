/**
 * Who sees the welcome flow. Pure decisions with no framework imports, so the
 * `/onboarding` page and the workspace-home nudge share one definition of
 * "finished" and one account-age window.
 */

export type WelcomeProgress = {
  completed_at?: string | null;
  dismissed_at?: string | null;
} | null;

export type WelcomeEntry = 'login' | 'workspace' | 'welcome';

/** A nudge is only for accounts this recent; older accounts never get it. */
export const WELCOME_NUDGE_WINDOW_DAYS = 30;

/** Finishing the flow and skipping it all both retire it. */
export function isWelcomeFinished(progress: WelcomeProgress): boolean {
  return Boolean(progress?.completed_at || progress?.dismissed_at);
}

/**
 * `/onboarding` renders the flow for a signed-in user who has not finished or
 * skipped it. A replay (from Settings) shows it again on purpose.
 */
export function resolveWelcomeEntry({
  progress,
  replay,
  signedIn,
}: {
  progress: WelcomeProgress;
  replay: boolean;
  signedIn: boolean;
}): WelcomeEntry {
  if (!signedIn) return 'login';
  if (replay) return 'welcome';
  return isWelcomeFinished(progress) ? 'workspace' : 'welcome';
}

/** The dismissible "Finish setting up" entry on a new user's workspace home. */
export function shouldShowWelcomeNudge({
  now = new Date(),
  progress,
  userCreatedAt,
}: {
  now?: Date;
  progress: WelcomeProgress;
  userCreatedAt: string | null | undefined;
}): boolean {
  if (isWelcomeFinished(progress) || !userCreatedAt) return false;
  const created = Date.parse(userCreatedAt);
  if (Number.isNaN(created)) return false;
  const ageDays = (now.getTime() - created) / 86_400_000;
  return ageDays >= 0 && ageDays <= WELCOME_NUDGE_WINDOW_DAYS;
}
