import type { E2EConfig, ModelInstance, StepExecutor } from 'e2e';
import { web } from '@e2e-dev/web';

export const FLEET_IDENTITY_ENV_NAMES = {
  email: [
    'E2E_USER_EMAIL',
    'E2E_SECRET_FLEET_EMAIL',
    'E2E_USER_FLEET_USERNAME',
    'E2E_FLEET_EMAIL',
    'TUTURUUU_FLEET_SMOKE_EMAIL',
    'TUTURUUU_FLEET_SMOKE_ID',
  ],
  password: [
    'E2E_SECRET_PASSWORD',
    'E2E_USER_FLEET_PASSWORD',
    'E2E_FLEET_PASSWORD',
    'TUTURUUU_FLEET_SMOKE_PASSWORD',
  ],
} as const;

const FLEET_SMOKE_UUID_PATTERN =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

/**
 * Shared Playwright Chromium options enforcing Tuturuuu's headless browser rules:
 * - Runs headless by default (`--headed` is only for local interactive runs, never CI).
 * - Never spoofs `userAgent` or injects challenge-bypass headers so adaptive abuse
 *   controls (`ABUSE_CHALLENGE_REQUIRED`) and Turnstile stay authentic.
 * - Uses deterministic desktop viewport, locale, and ICT timezone for stable replays.
 */
export const TUTURUUU_HEADLESS_WEB_OPTIONS = Object.freeze({
  browser: 'chromium' as const,
  viewport: Object.freeze({ width: 1280, height: 720 }),
  locale: 'en-US',
  timezoneId: 'Asia/Ho_Chi_Minh',
  testIdAttribute: 'data-testid',
});

export function resolveFleetEmailFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  const direct =
    env.E2E_USER_EMAIL?.trim() ||
    env.E2E_SECRET_FLEET_EMAIL?.trim() ||
    env.E2E_USER_FLEET_USERNAME?.trim() ||
    env.E2E_FLEET_EMAIL?.trim() ||
    env.TUTURUUU_FLEET_SMOKE_EMAIL?.trim();
  if (direct) return direct;

  const requestId = env.TUTURUUU_FLEET_SMOKE_ID?.trim();
  if (requestId && FLEET_SMOKE_UUID_PATTERN.test(requestId)) {
    return `qa-automation+${requestId}@smoke.tuturuuu.com`;
  }
  return '';
}

export function resolveFleetPasswordFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env
): string {
  return (
    env.E2E_SECRET_PASSWORD?.trim() ||
    env.E2E_USER_FLEET_PASSWORD?.trim() ||
    env.E2E_FLEET_PASSWORD?.trim() ||
    env.TUTURUUU_FLEET_SMOKE_PASSWORD?.trim() ||
    ''
  );
}

/**
 * Fail-closed executor used when no live model provider is configured (e.g., CI
 * running `npx e2e run --strict-cache`). Cached `agent.act()` steps replay before
 * `runStep` is ever invoked, guaranteeing zero model calls.
 */
export const offlineReplayExecutor: StepExecutor = {
  name: 'tuturuuu-offline-strict',
  async runStep(context) {
    return {
      status: 'failed',
      errorCode: 'MODEL_UNREACHABLE',
      summary: `No live model is configured for uncached step "${context.step.instruction}". Replay committed .e2e/cache entries with --strict-cache, or configure a local model provider to record updated traces.`,
    };
  },
};

export interface TuturuuuWebE2EConfigOptions {
  projectId?: string;
  targetName?: string;
  appIdentity?: string;
  tests: string | readonly string[];
  appUrl?: string;
  fixtureCommand?: {
    executable: string;
    args: readonly string[];
    inheritEnv?: readonly string[];
  };
  cacheDir?: string;
  model?: ModelInstance;
  executor?: StepExecutor;
  env?: Readonly<Record<string, string | undefined>>;
}

export function createTuturuuuWebE2EConfig(
  options: TuturuuuWebE2EConfigOptions
): E2EConfig {
  const env = options.env ?? process.env;
  const appUrl = options.appUrl?.trim() || env.E2E_APP_URL?.trim();
  const isCi = Boolean(env.CI && env.CI !== '0' && env.CI !== 'false');

  const app = appUrl
    ? {
        url: appUrl,
        identity: options.appIdentity ?? 'tuturuuu-web',
      }
    : {
        url: 'http://127.0.0.1:0',
        identity: options.appIdentity ?? 'tuturuuu-web',
        ...(options.fixtureCommand
          ? {
              command: {
                executable: options.fixtureCommand.executable,
                args: [...options.fixtureCommand.args],
                inheritEnv: [...(options.fixtureCommand.inheritEnv ?? [])],
              },
            }
          : {}),
      };

  const fleetEmail = resolveFleetEmailFromEnv(env);

  return {
    projectId: options.projectId ?? 'tuturuuu-platform',
    tests: options.tests,
    agents: {
      default: options.model
        ? { model: options.model }
        : { executor: options.executor ?? offlineReplayExecutor },
    },
    targets: [
      {
        name: options.targetName ?? 'web-chromium',
        engine: web({
          browser: TUTURUUU_HEADLESS_WEB_OPTIONS.browser,
          viewport: { ...TUTURUUU_HEADLESS_WEB_OPTIONS.viewport },
          locale: TUTURUUU_HEADLESS_WEB_OPTIONS.locale,
          timezoneId: TUTURUUU_HEADLESS_WEB_OPTIONS.timezoneId,
          testIdAttribute: TUTURUUU_HEADLESS_WEB_OPTIONS.testIdAttribute,
        }),
        app,
      },
    ],
    ...(fleetEmail
      ? {
          credentials: {
            fleet: {
              username: fleetEmail,
              password: () => resolveFleetPasswordFromEnv(env),
            },
          },
        }
      : {}),
    secrets: {
      'fleet-email': () => resolveFleetEmailFromEnv(env),
    },
    cache: {
      mode: isCi ? 'read-only' : 'read-write',
      dir: options.cacheDir ?? '.e2e/cache',
    },
    timeout: 60_000,
    actionTimeout: 15_000,
    assertionTimeout: 10_000,
    workers: 1,
    retries: 0,
    video: 'off',
    trace: 'retain-on-failure',
    reporters: ['list'],
  };
}
