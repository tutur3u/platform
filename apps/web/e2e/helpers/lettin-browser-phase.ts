import { test } from '@playwright/test';
import { safeLettinPhaseFailure } from './lettin-phase-diagnostics';

export const LETTIN_BROWSER_PHASE_TIMEOUT_MS = 60_000;

type BrowserPhase =
  | 'create profile page'
  | 'open profile'
  | 'edit canonical identity'
  | 'upload profile banner'
  | 'save canonical identity'
  | 'verify profile limits'
  | 'save rich About profile'
  | 'reload persisted profile'
  | 'verify public creator profile'
  | 'create Markdown page'
  | 'open wiki'
  | 'open project dialog'
  | 'create project'
  | 'confirm project navigation'
  | 'open notebook'
  | 'edit Markdown'
  | 'save Markdown'
  | 'reload persisted Markdown'
  | 'create import page'
  | 'open import wiki'
  | 'open import dialog'
  | 'configure import file'
  | 'upload canonical export'
  | 'review canonical export'
  | 'confirm canonical preview'
  | 'apply private import'
  | 'confirm imported navigation'
  | 'confirm imported privacy';

// Bound the complete public step, including browser instrumentation awaits.
// An action timeout alone does not bound every before/after tracing callback.
// Fixed phase names and summaries never expose URLs, tokens, or response bodies.
export async function runLettinBrowserPhase<T>(
  name: BrowserPhase,
  action: () => Promise<T>
): Promise<T> {
  console.info(`[lettin-e2e] ${name}: started`);
  try {
    const result = await test.step(name, action, {
      timeout: LETTIN_BROWSER_PHASE_TIMEOUT_MS,
    });
    console.info(`[lettin-e2e] ${name}: completed`);
    return result;
  } catch (error) {
    console.warn(`[lettin-e2e] ${name}: failed`, safeLettinPhaseFailure(error));
    throw error;
  }
}
