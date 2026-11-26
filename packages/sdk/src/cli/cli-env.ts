export const CLI_ENVS = ['prod', 'staging', 'sandbox', 'local'] as const;
export type CliEnv = (typeof CLI_ENVS)[number];

const ENV_ALIASES: Record<string, CliEnv> = {
  dev: 'local',
  development: 'local',
  local: 'local',
  localhost: 'local',
  prod: 'prod',
  production: 'prod',
  sandbox: 'sandbox',
  stage: 'staging',
  staging: 'staging',
};

export interface UpskiiOrigins {
  admin: string;
  app: string;
  auth: string;
}

export interface TuturuuuOrigins {
  admin: string;
  meet: string;
  tasks: string;
  web: string;
}

export function normalizeCliEnv(value: string): CliEnv {
  const normalized = ENV_ALIASES[value.trim().toLowerCase()];
  if (!normalized) {
    throw new Error(
      `Invalid --env "${value}". Expected one of: prod, staging, sandbox, local.`
    );
  }
  return normalized;
}

export interface ResolveCliEnvOptions {
  configuredEnv?: CliEnv;
  defaultEnv?: CliEnv;
  env?: Record<string, string | undefined>;
  explicitFlag?: string;
}

export function resolveCliEnv(options: ResolveCliEnvOptions = {}): CliEnv {
  const explicit = options.explicitFlag?.trim();
  if (explicit) return normalizeCliEnv(explicit);

  const fromProcessEnv = (options.env ?? process.env).TTR_ENV?.trim();
  if (fromProcessEnv) return normalizeCliEnv(fromProcessEnv);

  if (options.configuredEnv) return options.configuredEnv;
  return options.defaultEnv ?? 'staging';
}

function isLoopbackOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '::1' ||
        parsed.hostname === '[::1]' ||
        parsed.hostname.endsWith('.localhost'))
    );
  } catch {
    return false;
  }
}

function readLocalOrigin(
  env: Record<string, string | undefined>,
  key: string,
  fallback: string
): string {
  const raw = env[key]?.trim();
  if (!raw) return fallback;
  if (!isLoopbackOrigin(raw)) {
    throw new Error(
      `${key} must be a loopback or *.localhost origin when --env local is active.`
    );
  }
  return new URL(raw).origin;
}

/**
 * Resolves pinned Upskii origins per environment.
 * Production and staging hosts are fixed constants and cannot be redirected by env vars.
 */
export function resolveUpskiiOrigins(
  targetEnv: CliEnv,
  env: Record<string, string | undefined> = process.env
): UpskiiOrigins {
  switch (targetEnv) {
    case 'prod':
      return {
        admin: 'https://admin.upskii.com',
        app: 'https://app.upskii.com',
        auth: 'https://upskii.com',
      };
    case 'staging':
      return {
        admin: 'https://staging.admin.upskii.com',
        app: 'https://staging.app.upskii.com',
        auth: 'https://staging.upskii.com',
      };
    case 'sandbox':
      return {
        admin: 'https://sandbox.admin.upskii.com',
        app: 'https://sandbox.app.upskii.com',
        auth: 'https://sandbox.upskii.com',
      };
    case 'local':
      return {
        admin: readLocalOrigin(
          env,
          'UPSKII_LOCAL_ADMIN_URL',
          'http://localhost:3002'
        ),
        app: readLocalOrigin(
          env,
          'UPSKII_LOCAL_APP_URL',
          'http://localhost:3001'
        ),
        auth: readLocalOrigin(
          env,
          'UPSKII_LOCAL_AUTH_URL',
          'http://localhost:3000'
        ),
      };
  }
}

/**
 * Resolves pinned Tuturuuu origins per environment.
 */
export function resolveTuturuuuOrigins(
  targetEnv: CliEnv,
  env: Record<string, string | undefined> = process.env
): TuturuuuOrigins {
  switch (targetEnv) {
    case 'prod':
      return {
        admin: 'https://admin.tuturuuu.com',
        meet: 'https://meet.tuturuuu.com',
        tasks: 'https://tasks.tuturuuu.com',
        web: 'https://tuturuuu.com',
      };
    case 'staging':
      // Staging Tuturuuu apps live on *.tutur3u.com for cookie-domain isolation
      // from production *.tuturuuu.com.
      return {
        admin: 'https://infra.tutur3u.com',
        meet: 'https://meet.tutur3u.com',
        tasks: 'https://tasks.tutur3u.com',
        web: 'https://web.tutur3u.com',
      };
    case 'sandbox':
      return {
        admin: 'https://sandbox.infra.tutur3u.com',
        meet: 'https://sandbox.meet.tutur3u.com',
        tasks: 'https://sandbox.tasks.tutur3u.com',
        web: 'https://sandbox.web.tutur3u.com',
      };
    case 'local':
      return {
        admin: readLocalOrigin(
          env,
          'TUTURUUU_LOCAL_ADMIN_URL',
          'https://admin.tuturuuu.localhost'
        ),
        meet: readLocalOrigin(
          env,
          'TUTURUUU_LOCAL_MEET_URL',
          'https://meet.tuturuuu.localhost'
        ),
        tasks: readLocalOrigin(
          env,
          'TUTURUUU_LOCAL_TASKS_URL',
          'https://tasks.tuturuuu.localhost'
        ),
        web: readLocalOrigin(
          env,
          'TUTURUUU_LOCAL_BASE_URL',
          'https://tuturuuu.localhost'
        ),
      };
  }
}
