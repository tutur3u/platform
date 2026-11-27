import { mobile } from '@e2e-dev/mobile';
import type { E2EConfig, ModelInstance, StepExecutor } from 'e2e';

type Env = Readonly<Record<string, string | undefined>>;

export function mobileBundleId(env: Env = process.env): string {
  switch (env.TUTURUUU_MOBILE_E2E_FLAVOR?.trim() || 'dev') {
    case 'dev':
      return 'com.tuturuuu.app.mobile.dev';
    case 'stg':
      return 'com.tuturuuu.app.mobile.stg';
    default:
      throw new Error('TUTURUUU_MOBILE_E2E_FLAVOR must be dev or stg.');
  }
}

export function mobileArtifactPath(
  platform: 'ios' | 'android',
  env: Env = process.env
) {
  return platform === 'ios'
    ? env.TUTURUUU_MOBILE_E2E_IOS_APP
    : env.TUTURUUU_MOBILE_E2E_ANDROID_APP;
}

export function mobileQaSession(env: Env = process.env) {
  const accessToken =
    env.E2E_SECRET_MOBILE_ACCESS_TOKEN?.trim() ||
    env.E2E_USER_MOBILE_ACCESS_TOKEN?.trim() ||
    env.TUTURUUU_MOBILE_QA_ACCESS_TOKEN?.trim();
  const refreshToken =
    env.E2E_SECRET_MOBILE_REFRESH_TOKEN?.trim() ||
    env.E2E_USER_MOBILE_REFRESH_TOKEN?.trim() ||
    env.TUTURUUU_MOBILE_QA_REFRESH_TOKEN?.trim();

  if (!accessToken && !refreshToken) return undefined;
  if (
    !accessToken ||
    !refreshToken ||
    !/^[\w-]+\.[\w-]+\.[\w-]+$/u.test(accessToken) ||
    !/^[\w-]{6,}$/u.test(refreshToken)
  ) {
    throw new Error(
      'Provide a complete mobile QA access and refresh token pair.'
    );
  }
  return { accessToken, refreshToken };
}

export function mobileSessionCallback(
  session: NonNullable<ReturnType<typeof mobileQaSession>>,
  env: Env = process.env,
  nowSeconds = Math.floor(Date.now() / 1000)
): string {
  let expiresAt: unknown;
  try {
    const payload = session.accessToken.split('.')[1] ?? '';
    const claims: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString()
    );
    if (claims && typeof claims === 'object' && 'exp' in claims) {
      expiresAt = claims.exp;
    }
  } catch {
    // The error below omits the token and its claims.
  }
  if (
    typeof expiresAt !== 'number' ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= nowSeconds
  ) {
    throw new Error('Provide an unexpired mobile QA access token.');
  }
  const fragment = new URLSearchParams({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
    expires_in: String(expiresAt - nowSeconds),
    token_type: 'bearer',
  });
  return `${mobileBundleId(env)}://login-callback#${fragment}`;
}

export const offlineReplayExecutor: StepExecutor = {
  name: 'tuturuuu-mobile-offline-replay',
  async runStep() {
    return {
      status: 'failed',
      errorCode: 'MODEL_UNAVAILABLE',
      summary:
        'Mobile action has no usable recording. Record locally with a configured model or executor.',
    };
  },
};

type AgentOptions =
  | { model: ModelInstance; executor?: never }
  | { executor?: StepExecutor; model?: never };

type MobileConfigOptions = AgentOptions & { env?: Env };

export function createTuturuuuMobileE2EConfig({
  env = process.env,
  model,
  executor,
}: MobileConfigOptions = {}): E2EConfig {
  const bundleId = mobileBundleId(env);
  const isCi = Boolean(env.CI && env.CI !== '0' && env.CI !== 'false');
  const session = mobileQaSession(env);

  const app = {
    bundleId,
    environment: bundleId.endsWith('.stg')
      ? ('staging' as const)
      : ('test' as const),
  };

  return {
    projectId: 'tuturuuu-mobile',
    tests: 'tests/*.e2e.ts',
    agents: {
      default:
        isCi || !model
          ? {
              executor: isCi
                ? offlineReplayExecutor
                : (executor ?? offlineReplayExecutor),
            }
          : { model },
    },
    targets: [
      {
        name: 'ios',
        engine: mobile({
          platform: 'ios',
          device: env.TUTURUUU_MOBILE_E2E_IOS_DEVICE,
        }),
        app: { ...app, appPath: mobileArtifactPath('ios', env) },
      },
      {
        name: 'android',
        engine: mobile({
          platform: 'android',
          device: env.TUTURUUU_MOBILE_E2E_ANDROID_DEVICE,
        }),
        app: { ...app, appPath: mobileArtifactPath('android', env) },
      },
    ],
    ...(session && {
      secrets: {
        'mobile-access-token': session.accessToken,
        'mobile-refresh-token': session.refreshToken,
      },
    }),
    cache: {
      mode: isCi ? 'read-only' : 'read-write',
      dir: '.e2e/cache',
    },
    timeout: 90_000,
    actionTimeout: 20_000,
    assertionTimeout: 20_000,
    workers: 1,
    retries: 0,
    video: 'off',
    trace: 'off',
    reporters: ['list'],
  };
}
