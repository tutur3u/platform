const REQUIRED_SECRETS = [
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'MEET_REALTIME_TOKEN_SECRET',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
] as const;
const AI_DENYLIST = 'MEET_AI_DISABLED_WORKSPACE_IDS';

function present(vars: Record<string, unknown>, name: string) {
  const value = vars[name];
  return typeof value === 'string' && value.trim() !== '';
}

function aiExplicitlyOn(vars: Record<string, unknown>) {
  const disabled = vars.MEET_AI_DISABLED;
  return (
    typeof disabled === 'string' &&
    ['0', 'false'].includes(disabled.trim().toLowerCase())
  );
}

export function missingMeetSecrets(env: object) {
  const vars = env as Record<string, unknown>;
  const required: string[] = [...REQUIRED_SECRETS];
  if (aiExplicitlyOn(vars)) required.push(AI_DENYLIST);
  return required.filter((name) => !present(vars, name));
}

function origin(value: unknown) {
  try {
    return typeof value === 'string' ? new URL(value).origin : null;
  } catch {
    return null;
  }
}

/** Only the configured app and shared origins reach the app. */
export function isKnownMeetHost(request: Request, env: object) {
  const vars = env as Record<string, unknown>;
  const requested = new URL(request.url).origin;
  return (
    requested === origin(vars.NEXT_PUBLIC_APP_URL) ||
    requested === origin(vars.NEXT_PUBLIC_WEB_APP_URL)
  );
}

/** Refuses before any app code runs. The response never names a secret. */
export function refuseMeetRequest(request: Request, env: object) {
  const missing = missingMeetSecrets(env);
  if (missing.length > 0) {
    console.error('[meet] refusing to serve; missing secrets:', missing);
    return new Response('Service unavailable', {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  if (!isKnownMeetHost(request, env))
    return new Response('Not found', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  return null;
}
