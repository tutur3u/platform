import { type ShipCheckResult, shipCheckResultSchema } from './contract';

/**
 * Asks Cron Control to run the ship collector now. Cron Control owns the
 * durable rate limit (one run per 30 seconds across schedule and checks) and
 * the job's stop fence; Web only relays the owner's request.
 *
 * On Cloudflare, Web's api-core Worker reaches Cron Control through its
 * CRON_CONTROL service binding (Cron Control has no public ingress). Without
 * a binding, MASTERMIND_SHIP_CHECK_ORIGIN (falling back to
 * WEB_CRON_GATE_ORIGIN) names an HTTPS origin instead. Either way the request
 * carries MASTERMIND_SHIP_CHECK_TOKEN, which Cron Control verifies.
 */
export interface ShipCheckEnv {
  MASTERMIND_SHIP_CHECK_ORIGIN?: string;
  MASTERMIND_SHIP_CHECK_TOKEN?: string;
  WEB_CRON_GATE_ORIGIN?: string;
}

const TIMEOUT_MS = 45_000;
const MAX_BYTES = 1024;

export type ShipCheckOutcome = ShipCheckResult & { status: number };

/** A service binding's fetch; its URL host is ignored. */
export interface ShipCheckBinding {
  fetch: typeof fetch;
}

const BINDING_URL = 'https://cron-control.internal/mastermind-ship/check';

function originOf(env: ShipCheckEnv) {
  try {
    const origin = new URL(
      env.MASTERMIND_SHIP_CHECK_ORIGIN || env.WEB_CRON_GATE_ORIGIN || ''
    );
    return origin.protocol === 'https:' && !origin.username && !origin.password
      ? origin
      : null;
  } catch {
    return null;
  }
}

export async function requestShipCheck(
  env: ShipCheckEnv,
  binding: ShipCheckBinding | null = null,
  send: typeof fetch = fetch
): Promise<ShipCheckOutcome> {
  const token = env.MASTERMIND_SHIP_CHECK_TOKEN ?? '';
  const origin = binding ? null : originOf(env);
  if ((!binding && !origin) || token.length < 32)
    return { state: 'unconfigured', status: 503 };
  const target = origin
    ? new URL('/mastermind-ship/check', origin)
    : BINDING_URL;
  let response: Response;
  try {
    response = await (binding ? binding.fetch.bind(binding) : send)(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'Tuturuuu-Mastermind-Ship/1.0',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { state: 'failed', status: 502 };
  }
  try {
    const text = await response.text();
    if (text.length > MAX_BYTES) return { state: 'failed', status: 502 };
    const parsed = shipCheckResultSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return { state: 'failed', status: 502 };
    const status =
      parsed.data.state === 'checked'
        ? 200
        : parsed.data.state === 'rate_limited'
          ? 429
          : parsed.data.state === 'failed'
            ? 502
            : parsed.data.state === 'unconfigured'
              ? 503
              : 409;
    return { ...parsed.data, status };
  } catch {
    return { state: 'failed', status: 502 };
  }
}
