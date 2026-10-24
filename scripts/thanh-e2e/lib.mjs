// Pure configuration helpers for the Thanh local end-to-end environment.
// Side effects (Docker, Supabase, dev servers, devices) live in thanh-e2e.mjs.

import os from 'node:os';
import path from 'node:path';

export const DEFAULT_PROJECT_ID = 'tuturuuu-e2e';
// Canonical local ports: the web local-E2E auth/captcha bypass and the
// Playwright safety guard only trust Supabase :8001 and web :7803 on loopback.
// Isolation comes from the project id; `up` fails fast if a port is busy.
export const DEFAULT_SUPABASE_BASE_PORT = 8000;
export const DEFAULT_WEB_PORT = 7803;
export const LOOPBACK_HOST = '127.0.0.1';

// Satellite apps web proxies to for mobile flows (web proxies Calendar's
// event API to the Calendar app). Ports match their `dev:app` defaults.
export const KNOWN_SATELLITES = Object.freeze({ calendar: 7806 });

export function parseSatellites(value) {
  if (value === undefined) return ['calendar'];
  const names = value
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name && name !== 'none');
  for (const name of names) {
    if (!Object.hasOwn(KNOWN_SATELLITES, name)) {
      throw new Error(`Unknown satellite in TUTURUUU_E2E_SATELLITES: ${name}`);
    }
  }
  return names;
}

// Same synthetic coordination secret as the web E2E fixtures; never a real value.
export const LOCAL_APP_COORDINATION_SECRET =
  'local-e2e-app-coordination-secret';

// Seeded by apps/database/supabase/seed.sql with the public local-only password.
export const SEEDED_ACCOUNTS = Object.freeze([
  'local@tuturuuu.com',
  'user1@tuturuuu.com',
  'user2@tuturuuu.com',
]);

// Mobile dart-defines that route each API owner (see apps/mobile api_origins).
export const MOBILE_API_OVERRIDE_KEYS = Object.freeze([
  'API_BASE_URL',
  'TASKS_API_BASE_URL',
  'FINANCE_API_BASE_URL',
  'INVENTORY_API_BASE_URL',
  'CONTACTS_API_BASE_URL',
  'CALENDAR_API_BASE_URL',
  'TEACH_API_BASE_URL',
  'TRACK_API_BASE_URL',
  'MAIL_API_BASE_URL',
  'INFRASTRUCTURE_API_BASE_URL',
]);

function parsePort(name, value, fallback) {
  if (value === undefined || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65_000) {
    throw new Error(`${name} must be an integer port between 1024 and 65000.`);
  }
  return port;
}

export function resolveConfig(env = process.env, { home = os.homedir() } = {}) {
  const projectId = env.TUTURUUU_E2E_PROJECT_ID || DEFAULT_PROJECT_ID;
  if (!/^[a-z0-9][a-z0-9-]{2,40}$/.test(projectId)) {
    throw new Error('TUTURUUU_E2E_PROJECT_ID must be a lowercase slug.');
  }
  if (projectId === 'tuturuuu') {
    throw new Error(
      'Refusing the default project id; it collides with bun sb:start.'
    );
  }
  const supabaseBasePort = parsePort(
    'TUTURUUU_E2E_SUPABASE_BASE_PORT',
    env.TUTURUUU_E2E_SUPABASE_BASE_PORT,
    DEFAULT_SUPABASE_BASE_PORT
  );
  const webPort = parsePort(
    'TUTURUUU_E2E_WEB_PORT',
    env.TUTURUUU_E2E_WEB_PORT,
    DEFAULT_WEB_PORT
  );
  if (webPort >= supabaseBasePort && webPort < supabaseBasePort + 8) {
    throw new Error('TUTURUUU_E2E_WEB_PORT overlaps the Supabase port block.');
  }
  const stateDir = path.resolve(
    env.TUTURUUU_E2E_HOME ||
      path.join(home, 'ci-lanes', 'tuturuuu-tools', 'e2e', projectId)
  );
  const avdPort = parsePort(
    'TUTURUUU_E2E_AVD_PORT',
    env.TUTURUUU_E2E_AVD_PORT,
    5580
  );
  return {
    projectId,
    iosSimulator: env.TUTURUUU_E2E_IOS_SIM || 'tuturuuu-ios-iphone17pro',
    avd: env.TUTURUUU_E2E_AVD || 'tuturuuu-android-36-pixel9pro',
    avdPort,
    androidSerial: `emulator-${avdPort}`,
    satellites: parseSatellites(env.TUTURUUU_E2E_SATELLITES),
    stateDir,
    supabaseBasePort,
    supabaseApiPort: supabaseBasePort + 1,
    supabaseDbPort: supabaseBasePort + 2,
    supabaseStudioPort: supabaseBasePort + 3,
    supabaseMailPort: supabaseBasePort + 4,
    webPort,
    supabaseWorkdir: path.join(stateDir, 'supabase-workdir'),
    dockerConfigDir: path.join(stateDir, 'docker-config'),
    logsDir: path.join(stateDir, 'logs'),
    shotsDir: path.join(stateDir, 'shots'),
    envDir: path.join(stateDir, 'env'),
    webPidFile: path.join(stateDir, 'web.pid'),
    pidFile: (name) => path.join(stateDir, `${name}.pid`),
  };
}

// Browser-facing web origin. Next dev only serves its dev resources (HMR,
// hydration) to localhost; 127.0.0.1 pages stay unhydrated with disabled forms.
export function webOrigin(port) {
  return `http://localhost:${port}`;
}

export function loopbackUrl(port) {
  return `http://${LOOPBACK_HOST}:${port}`;
}

// Docker over SSH must not reach the macOS keychain (credsStore "desktop").
// An isolated, credential-free DOCKER_CONFIG keeps anonymous public pulls working.
export function dockerEnv(config, env = process.env) {
  const host =
    env.TUTURUUU_E2E_DOCKER_HOST ||
    env.DOCKER_HOST ||
    `unix://${path.join(os.homedir(), '.docker', 'run', 'docker.sock')}`;
  return {
    DOCKER_CONFIG: config.dockerConfigDir,
    DOCKER_HOST: host,
  };
}

export function isolatedDockerConfigJson() {
  return `${JSON.stringify({ auths: {} }, null, 2)}\n`;
}

// Normalizes `supabase status -o json` across CLI versions.
export function parseSupabaseStatus(json) {
  const status = typeof json === 'string' ? JSON.parse(json) : json;
  const pick = (...keys) => keys.map((key) => status[key]).find(Boolean);
  const result = {
    apiUrl: pick('API_URL'),
    dbUrl: pick('DB_URL'),
    publishableKey: pick('PUBLISHABLE_KEY', 'ANON_KEY'),
    secretKey: pick('SECRET_KEY', 'SERVICE_ROLE_KEY'),
    studioUrl: pick('STUDIO_URL'),
    mailUrl: pick('INBUCKET_URL', 'MAILPIT_URL'),
  };
  for (const key of ['apiUrl', 'publishableKey', 'secretKey']) {
    if (!result[key]) throw new Error(`supabase status is missing ${key}.`);
  }
  return result;
}

export function assertLoopback(name, value) {
  const { hostname } = new URL(value);
  if (!['127.0.0.1', 'localhost'].includes(hostname)) {
    throw new Error(`Refusing non-loopback ${name}: ${hostname}`);
  }
}

function satelliteUrls(config) {
  const urls = {};
  for (const name of config.satellites) {
    const url = webOrigin(KNOWN_SATELLITES[name]);
    urls[`${name.toUpperCase()}_APP_URL`] = url;
    urls[`NEXT_PUBLIC_${name.toUpperCase()}_APP_URL`] = url;
  }
  return urls;
}

export function satelliteEnv(config, status, name) {
  const port = KNOWN_SATELLITES[name];
  const web = webOrigin(config.webPort);
  return {
    ...webEnv(config, status),
    PORT: String(port),
    NEXT_PUBLIC_APP_URL: webOrigin(port),
    WEB_APP_URL: web,
    NEXT_PUBLIC_WEB_APP_URL: web,
    INTERNAL_WEB_API_ORIGIN: web,
  };
}

export function webEnv(config, status) {
  assertLoopback('Supabase API URL', status.apiUrl);
  return {
    NEXT_PUBLIC_SUPABASE_URL: status.apiUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.publishableKey,
    SUPABASE_SECRET_KEY: status.secretKey,
    TUTURUUU_APP_COORDINATION_SECRET: LOCAL_APP_COORDINATION_SECRET,
    // Existing local-only opt-in used by CI web E2E; local-e2e.ts enables it
    // only for loopback :7803 web and :8001 Supabase origins.
    TUTURUUU_LOCAL_E2E_AUTH_BYPASS: '1',
    NEXT_PUBLIC_WEB_APP_URL: webOrigin(config.webPort),
    PORT: String(config.webPort),
    NEXT_TELEMETRY_DISABLED: '1',
    ...satelliteUrls(config),
  };
}

export function playwrightEnv(config, status) {
  return {
    ...webEnv(config, status),
    BASE_URL: webOrigin(config.webPort),
  };
}

// Android only permits cleartext to 127.0.0.1/localhost and the app rewrites
// "localhost" to 10.0.2.2, so loopback IPs plus `adb reverse` reach the host.
export function mobileDefines(config, status) {
  assertLoopback('Supabase API URL', status.apiUrl);
  const apiUrl = new URL(status.apiUrl);
  const defines = {
    NEXT_PUBLIC_SUPABASE_URL: `http://${LOOPBACK_HOST}:${apiUrl.port}`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.publishableKey,
    TURNSTILE_SITE_KEY: '',
    TURNSTILE_BASE_URL: '',
  };
  for (const key of MOBILE_API_OVERRIDE_KEYS) {
    defines[key] = loopbackUrl(config.webPort);
  }
  return defines;
}

// Same synthetic Firebase config CI writes for Android builds (no real keys).
export function dummyGoogleServicesJson() {
  const client = (suffix, id) => ({
    client_info: {
      mobilesdk_app_id: `1:123:android:${id}`,
      android_client_info: { package_name: `com.tuturuuu.app.mobile${suffix}` },
    },
    oauth_client: [],
    api_key: [{ current_key: 'dummy_key' }],
    services: { appinvite_service: { other_platform_oauth_client: [] } },
  });
  return `${JSON.stringify({
    project_info: {
      project_number: '123',
      firebase_url: 'https://dummy.firebaseio.com',
      project_id: 'dummy-project',
      storage_bucket: 'dummy.appspot.com',
    },
    client: [client('', 'abc'), client('.dev', 'def'), client('.stg', 'ghi')],
  })}\n`;
}

// Matches the integration test's `E2E_SHOT <name>` device-log marker.
export function parseShotMarker(line) {
  const match = /\bE2E_SHOT ([a-z0-9][a-z0-9-]{0,63})\b/.exec(line);
  return match ? match[1] : null;
}

export function adbReversePorts(config) {
  return [config.webPort, config.supabaseApiPort];
}

export function formatEnvFile(values) {
  return `${Object.entries(values)
    .map(([key, value]) => `${key}=${String(value).replace(/\n/g, '')}`)
    .join('\n')}\n`;
}

export const COMMANDS = Object.freeze({
  doctor: 'Print toolchain, Docker, port and state readiness.',
  up: 'Stage the isolated Supabase project, start it, apply migrations + seed.',
  seed: 'Re-apply migrations and seed data (supabase db reset).',
  env: 'Rewrite web/mobile env files from the running stack.',
  web: 'Start the apps/web dev server against the isolated stack (detached).',
  'web-e2e': 'Run apps/web Playwright against the local web server.',
  devices: 'Boot the dedicated simulator/emulator and wire adb reverse.',
  'mobile-e2e':
    'Run the mobile integration_test flow on ios|android (--mode=profile|release on Android shows the release gray screen).',
  status: 'Show stack, web server and device status.',
  down: 'Stop web and Supabase (--web-only keeps Supabase; --purge drops volumes).',
});

export function parseCliArgs(argv) {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help') {
    return { command: 'help', flags: {}, positionals: [] };
  }
  if (!Object.hasOwn(COMMANDS, command)) {
    throw new Error(`Unknown command: ${command}`);
  }
  const flags = {};
  const positionals = [];
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--') {
      positionals.push(...rest.slice(index + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const [key, inline] = arg.slice(2).split('=', 2);
      flags[key] = inline ?? true;
    } else {
      positionals.push(arg);
    }
  }
  return { command, flags, positionals };
}

export function helpText() {
  const width = Math.max(...Object.keys(COMMANDS).map((name) => name.length));
  return [
    'Usage: node scripts/thanh-e2e/thanh-e2e.mjs <command> [flags]',
    '',
    ...Object.entries(COMMANDS).map(
      ([name, description]) => `  ${name.padEnd(width)}  ${description}`
    ),
    '',
    'Environment: TUTURUUU_E2E_PROJECT_ID, TUTURUUU_E2E_SUPABASE_BASE_PORT,',
    'TUTURUUU_E2E_WEB_PORT, TUTURUUU_E2E_HOME, TUTURUUU_E2E_DOCKER_HOST,',
    'TUTURUUU_E2E_IOS_SIM, TUTURUUU_E2E_AVD, TUTURUUU_E2E_AVD_PORT.',
  ].join('\n');
}
