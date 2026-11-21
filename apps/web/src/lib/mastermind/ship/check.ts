import { type ShipCheckResult, shipCheckResultSchema } from './contract';

/**
 * Asks Cron Control to run the ship collector now. Cron Control owns the
 * durable rate limit (one run per 30 seconds across schedule and checks) and
 * the job's stop fence; Web only relays the owner's request.
 *
 * MASTERMIND_SHIP_CHECK_ORIGIN (falling back to WEB_CRON_GATE_ORIGIN) is the
 * Cron Control HTTPS origin and MASTERMIND_SHIP_CHECK_TOKEN its check token.
 */
export interface ShipCheckEnv {
  MASTERMIND_SHIP_CHECK_ORIGIN?: string;
  MASTERMIND_SHIP_CHECK_TOKEN?: string;
  WEB_CRON_GATE_ORIGIN?: string;
}

const TIMEOUT_MS = 45_000;
const MAX_BYTES = 1024;

export type ShipCheckOutcome = ShipCheckResult & { status: number };

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
  send: typeof fetch = fetch
): Promise<ShipCheckOutcome> {
  const token = env.MASTERMIND_SHIP_CHECK_TOKEN ?? '';
  const origin = originOf(env);
  if (!origin || token.length < 32)
    return { state: 'unconfigured', status: 503 };
  let response: Response;
  try {
    response = await send(new URL('/mastermind-ship/check', origin), {
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
