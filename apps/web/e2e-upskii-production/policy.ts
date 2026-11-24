/**
 * Production E2E policy for the Upskii suites (meet-flow, learner, educator,
 * admin). Hosts are fixed production origins; nothing here can be pointed at
 * another deployment by environment. Every account the suite touches must be a
 * QA identity, and every Upskii object it creates carries the run marker so an
 * orphan sweep can find it after a crashed run.
 */

export const HOSTS = {
  tuturuuu: 'https://tuturuuu.com',
  meet: 'https://meet.tuturuuu.com',
  upskiiApp: 'https://app.upskii.com',
  upskiiAuth: 'https://upskii.com',
  upskiiAdmin: 'https://admin.upskii.com',
} as const;

export const SUITES = ['meet-flow', 'learner', 'educator', 'admin'] as const;
export type Suite = (typeof SUITES)[number];

/** Tuturuuu QA runs created by this suite always use this purpose. */
export const QA_PURPOSE = 'upskii-e2e';
/** Hard caps; the server enforces its own limits as well. */
export const LIMITS = {
  tuturuuuAccountsPerRun: 4,
  tuturuuuStaffHostsPerRun: 1,
  tuturuuuRunTtlSeconds: 2 * 60 * 60,
  requestTimeoutMs: 20_000,
  cleanupDeadlineMs: 5 * 60 * 1000,
} as const;

type Env = Record<string, string | undefined>;

const TUTURUUU_QA_EMAIL =
  /^qa\+[a-z0-9]{8}-\d{1,3}@(?:tutur3u|tuturuuu)\.com$/u;
const UPSKII_QA_EMAIL = /^qa-fleet\+[a-z0-9-]{1,40}@tuturuuu\.com$/u;
const RUN_LABEL = /^[a-z0-9][a-z0-9-]{3,39}$/u;
const MARKER_PREFIX = '[QA-E2E ';

export function isTuturuuuQaEmail(email: unknown): email is string {
  return typeof email === 'string' && TUTURUUU_QA_EMAIL.test(email);
}

export function isUpskiiQaEmail(email: unknown): email is string {
  return typeof email === 'string' && UPSKII_QA_EMAIL.test(email);
}

export function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Required production E2E input: ${name}`);
  return value;
}

/** Title marker for every Upskii object a test creates. */
export function marker(runLabel: string, what: string): string {
  if (!RUN_LABEL.test(runLabel)) throw new Error('Invalid run label');
  return `${MARKER_PREFIX}${runLabel}] ${what}`.slice(0, 120);
}

export function hasMarker(title: unknown): boolean {
  return typeof title === 'string' && title.startsWith(MARKER_PREFIX);
}

export function markerRun(title: unknown): string | null {
  if (!hasMarker(title)) return null;
  const end = (title as string).indexOf(']');
  const run = (title as string).slice(MARKER_PREFIX.length, end);
  return RUN_LABEL.test(run) ? run : null;
}

export function parseSuites(value: string | undefined): Suite[] {
  if (!value || value.trim() === '' || value.trim() === 'all')
    return [...SUITES];
  const picked = value.split(',').map((part) => part.trim());
  for (const name of picked) {
    if (!(SUITES as readonly string[]).includes(name))
      throw new Error(`Unknown suite: ${name}`);
  }
  return [...new Set(picked)] as Suite[];
}

export interface RunConfig {
  runLabel: string;
  suites: Suite[];
  ledgerPath: string;
}

/**
 * The in-code kill switch mirrors the workflow gate so a local or forked
 * invocation cannot run against production by accident.
 */
export function readRunConfig(env: Env): RunConfig {
  if (env.UPSKII_PRODUCTION_E2E_ENABLED !== 'true')
    throw new Error(
      'Upskii production E2E is disabled (UPSKII_PRODUCTION_E2E_ENABLED)'
    );
  const runLabel = required(env, 'UPSKII_E2E_RUN_LABEL').toLowerCase();
  if (!RUN_LABEL.test(runLabel))
    throw new Error('Invalid UPSKII_E2E_RUN_LABEL');
  return {
    runLabel,
    suites: parseSuites(env.UPSKII_E2E_SUITES),
    ledgerPath: required(env, 'UPSKII_E2E_LEDGER'),
  };
}

const ORIGINS: ReadonlySet<string> = new Set(Object.values(HOSTS));
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Browser egress fence: reads may go anywhere the product loads assets from,
 * but writes may only reach the fixed product origins, Turnstile and the
 * Supabase Auth endpoints the Tuturuuu sign-in uses.
 */
export function allowedBrowserRequest(url: string, method: string): boolean {
  if (READ_METHODS.has(method.toUpperCase())) return true;
  const target = new URL(url);
  if (ORIGINS.has(target.origin)) return true;
  if (target.origin === 'https://challenges.cloudflare.com') return true;
  return (
    /^https:\/\/[a-z0-9]{20}\.supabase\.co$/u.test(target.origin) &&
    target.pathname.startsWith('/auth/v1/')
  );
}

/** Build an absolute URL on a fixed host; refuses scheme-relative paths. */
export function on(host: keyof typeof HOSTS, path: string): string {
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new Error('Expected an absolute product path');
  const url = new URL(path, HOSTS[host]);
  if (url.origin !== HOSTS[host]) throw new Error('Path escaped its host');
  return url.toString();
}
