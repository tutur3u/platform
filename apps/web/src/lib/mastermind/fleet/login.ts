import { z } from 'zod';

/**
 * Access requests: a CLI or provider on a fleet machine needs the owner to
 * sign in. The sign-in URL is the one field in the fleet snapshot that may
 * carry a URL, so it is validated structurally instead of scrubbed: https,
 * no credentials, default port and a host on the service's allowlist. The
 * user code is a short display code (device-flow shape), never a token, and
 * both are dropped once the request reaches a terminal state.
 */
export const FLEET_LOGIN_HOSTS = {
  github: ['github.com'],
  cloudflare: ['dash.cloudflare.com'],
  vercel: ['vercel.com'],
  claude: ['claude.ai', 'claude.com', 'console.anthropic.com'],
  openai: ['auth.openai.com', 'chatgpt.com', 'platform.openai.com'],
  google: ['accounts.google.com'],
  apple: ['appleid.apple.com', 'appstoreconnect.apple.com'],
  supabase: ['supabase.com'],
  microsoft: ['microsoft.com', 'login.microsoftonline.com'],
} as const satisfies Record<string, readonly string[]>;

export type FleetLoginService = keyof typeof FLEET_LOGIN_HOSTS;
export const fleetLoginServices = Object.keys(FLEET_LOGIN_HOSTS) as [
  FleetLoginService,
  ...FleetLoginService[],
];

/**
 * - `device`: open the URL on any device and enter the code.
 * - `link`: open the URL on any device; no code.
 * - `local_callback`: the provider redirects to a loopback listener on the
 *   machine, so the URL only completes in a browser on that machine.
 */
export const fleetLoginFlows = ['device', 'link', 'local_callback'] as const;
export const fleetLoginStates = [
  'waiting',
  'approved',
  'verified',
  'expired',
  'failed',
] as const;
export type FleetLoginState = (typeof fleetLoginStates)[number];
const TERMINAL: readonly FleetLoginState[] = ['verified', 'expired', 'failed'];

export const FLEET_LOGIN_URL_MAX = 2048;
const USER_CODE = /^[A-Z0-9]{3,8}(-[A-Z0-9]{3,8}){0,2}$/;

/** Requests expire within a day of being published. */
export const FLEET_LOGIN_MAX_TTL_MS = 24 * 60 * 60 * 1000;

function hostAllowed(service: FleetLoginService, host: string) {
  return FLEET_LOGIN_HOSTS[service].some(
    (allowed) => host === allowed || host.endsWith(`.${allowed}`)
  );
}

function isLoopback(url: URL) {
  return (
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  );
}

/**
 * Returns the normalized URL when it is safe to show for `service`: https,
 * no credentials, port or fragment, a host on the service allowlist, no query
 * on device pages, and an OAuth authorize link whose `redirect_uri` returns
 * the code to a loopback listener (the agent's own CLI) or to the same
 * provider, never to a third-party callback. The client id itself is not
 * pinned: CLIs rotate them, and a loopback callback delivers the code only
 * to a listener on the agent's own machine, so an unknown client cannot
 * collect it elsewhere.
 */
export function safeLoginUrl(
  service: FleetLoginService,
  raw: string,
  flow: (typeof fleetLoginFlows)[number] = 'link'
): string | null {
  if (raw.length > FLEET_LOGIN_URL_MAX) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    return null;
  if (url.hash || !hostAllowed(service, url.hostname.toLowerCase()))
    return null;
  if (flow === 'device' && url.search) return null;
  const params = url.searchParams;
  // One value per OAuth parameter: a provider picking a later duplicate
  // would use a callback this check never saw.
  for (const key of ['client_id', 'response_type', 'redirect_uri'])
    if (params.getAll(key).length > 1) return null;
  if (params.has('client_id') || params.has('response_type')) {
    let redirect: URL;
    try {
      redirect = new URL(params.get('redirect_uri') ?? '');
    } catch {
      return null;
    }
    const providerHosted =
      redirect.protocol === 'https:' &&
      hostAllowed(service, redirect.hostname.toLowerCase());
    if (!isLoopback(redirect) && !providerHosted) return null;
    // Loopback reaches whichever device opens the link, so it only works
    // on the agent's machine: such a link must say so.
    if (isLoopback(redirect) && flow !== 'local_callback') return null;
  }
  const normalized = url.toString();
  return normalized.length > FLEET_LOGIN_URL_MAX ? null : normalized;
}

const isoTime = z.iso.datetime({ offset: true });

export const fleetLoginSchema = z
  .object({
    service: z.enum(fleetLoginServices),
    flow: z.enum(fleetLoginFlows),
    state: z.enum(fleetLoginStates),
    url: z.string().max(FLEET_LOGIN_URL_MAX).optional(),
    userCode: z
      .string()
      .transform((value) => value.trim().toUpperCase())
      .pipe(z.string().regex(USER_CODE))
      .optional(),
    expiresAt: isoTime.optional(),
    /** Machine where the sign-in must land; a fleet machine id slug. */
    machineId: z
      .string()
      .regex(/^[a-z0-9][a-z0-9._-]{0,63}$/)
      .optional(),
  })
  .superRefine((login, ctx) => {
    const terminal = TERMINAL.includes(login.state);
    if (terminal && (login.url || login.userCode)) {
      ctx.addIssue({
        code: 'custom',
        message: 'terminal login keeps no url or code',
        path: ['state'],
      });
    }
    if (!terminal && !login.url) {
      ctx.addIssue({ code: 'custom', message: 'url required', path: ['url'] });
    }
    if (
      !terminal &&
      (!login.expiresAt ||
        Date.parse(login.expiresAt) > Date.now() + FLEET_LOGIN_MAX_TTL_MS)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'open login needs an expiry within a day',
        path: ['expiresAt'],
      });
    }
    if (login.url && !safeLoginUrl(login.service, login.url, login.flow)) {
      ctx.addIssue({
        code: 'custom',
        message: 'url not allowed for service',
        path: ['url'],
      });
    }
    if (login.flow === 'device' && !terminal && !login.userCode) {
      ctx.addIssue({
        code: 'custom',
        message: 'device flow needs a code',
        path: ['userCode'],
      });
    }
    if (login.flow === 'local_callback' && !login.machineId) {
      ctx.addIssue({
        code: 'custom',
        message: 'local callback names its machine',
        path: ['machineId'],
      });
    }
    if (login.flow !== 'device' && login.userCode) {
      ctx.addIssue({
        code: 'custom',
        message: 'only device flow carries a code',
        path: ['userCode'],
      });
    }
  })
  .transform((login) => ({
    ...login,
    ...(login.url
      ? { url: safeLoginUrl(login.service, login.url, login.flow) as string }
      : {}),
  }));

export type FleetLogin = z.infer<typeof fleetLoginSchema>;

/** True while the owner can still act on the request. */
export function isLoginActionable(
  login: Pick<FleetLogin, 'state' | 'expiresAt'>,
  now = new Date()
) {
  const state = effectiveLoginState(login, now);
  return state === 'waiting' || state === 'approved';
}

/** A waiting or approved request whose expiry has passed reads as expired. */
export function effectiveLoginState(
  login: Pick<FleetLogin, 'state' | 'expiresAt'>,
  now = new Date()
): FleetLoginState {
  if (
    (login.state === 'waiting' || login.state === 'approved') &&
    login.expiresAt &&
    Date.parse(login.expiresAt) <= now.getTime()
  )
    return 'expired';
  return login.state;
}
