import { execFileSync } from 'node:child_process';
import { safeLettinPhaseFailure } from './lettin-phase-diagnostics';

type FixturePhase =
  | 'create fixture account'
  | 'apply D1 migrations'
  | 'seed D1 creator'
  | 'seed fixture workspace'
  | 'create browser context'
  | 'install session cookies'
  | 'create timeline page'
  | 'open timeline'
  | 'confirm timeline'
  | 'open relationships'
  | 'confirm relationships'
  | 'close timeline context'
  | 'delete fixture media'
  | 'delete D1 fixtures'
  | 'delete fixture workspace'
  | 'delete fixture account';

// Fixed names and summaries only: never print SQL, tokens, URLs or bodies.
export async function lettinFixturePhase<T>(
  name: FixturePhase,
  action: () => Promise<T> | T
): Promise<T> {
  console.info(`[lettin-e2e] ${name}: started`);
  try {
    const result = await action();
    console.info(`[lettin-e2e] ${name}: completed`);
    return result;
  } catch (error) {
    console.warn(`[lettin-e2e] ${name}: failed`, safeLettinPhaseFailure(error));
    throw error;
  }
}

export const LETTIN_FIXTURE_COMMAND_OPTIONS = {
  timeout: 60_000,
  // execFileSync waits for exit after its timeout signal. SIGTERM can leave a
  // synchronous child alive and block Playwright's own timeout machinery.
  killSignal: 'SIGKILL' as const,
  stdio: 'pipe' as const,
};

export function runLettinFixtureCommand(args: string[], cwd: string) {
  execFileSync('bunx', args, { ...LETTIN_FIXTURE_COMMAND_OPTIONS, cwd });
}
