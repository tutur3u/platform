import { randomUUID } from 'node:crypto';
import { AbuseGuardUnavailableError } from '@tuturuuu/utils/abuse-guard/client';
import { z } from 'zod';
import { sendLiveMintBudgetAlert } from './mint-cap-alerts';
import { getLiveMintStore, type LiveMintStore } from './mint-cap-store';

export {
  createGuardLiveMintStore,
  createRedisLiveMintStore,
  type LiveMintStore,
  RESERVE_LIVE_MINT_SCRIPT,
} from './mint-cap-store';

export interface LiveMintConfig {
  freeSessionSeconds: number;
  actorDailyMints: number;
  dailyBudgetMicroUsd: number;
  usdPerMinuteMicroUsd: number;
  /** Refuses free-tier mints. On unless `LIVE_MINT_KILL_SWITCH=false`. */
  killSwitch: boolean;
  /** Emergency stop for paid mints. Off unless `LIVE_PAID_KILL_SWITCH=true`. */
  paidKillSwitch: boolean;
  actorMaxConcurrent: number;
}
export class LiveMintCapError extends Error {
  constructor(
    readonly status: 429 | 503,
    readonly code: string,
    readonly retryAfter = 60
  ) {
    super('Live voice admission is unavailable.');
    this.name = 'LiveMintCapError';
  }
}
const configSchema = z.object({
  freeSessionSeconds: z.number().int().min(1).max(3600),
  actorDailyMints: z.number().int().min(1).max(1000),
  dailyBudgetMicroUsd: z.number().int().min(1).max(1_000_000_000_000),
  usdPerMinuteMicroUsd: z.number().int().min(1).max(1_000_000_000),
  killSwitch: z.boolean(),
  paidKillSwitch: z.boolean(),
  actorMaxConcurrent: z.number().int().min(1).max(100),
});
function integer(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value))
    throw new LiveMintCapError(503, 'LIVE_MINT_CONFIG_INVALID');
  return Number(value);
}
function microUsd(value: string): number {
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,6}))?$/.exec(value);
  if (!match) throw new LiveMintCapError(503, 'LIVE_MINT_CONFIG_INVALID');
  const whole = match[1];
  if (whole === undefined)
    throw new LiveMintCapError(503, 'LIVE_MINT_CONFIG_INVALID');
  const result = Number(
    BigInt(whole) * 1_000_000n + BigInt((match[2] ?? '').padEnd(6, '0'))
  );
  if (!Number.isSafeInteger(result))
    throw new LiveMintCapError(503, 'LIVE_MINT_CONFIG_INVALID');
  return result;
}
export function readLiveMintConfig(
  env: Record<string, string | undefined> = process.env
): LiveMintConfig {
  const kill = env.LIVE_MINT_KILL_SWITCH;
  if (kill !== undefined && kill !== 'true' && kill !== 'false')
    throw new LiveMintCapError(503, 'LIVE_MINT_CONFIG_INVALID');
  const paidKill = env.LIVE_PAID_KILL_SWITCH;
  if (paidKill !== undefined && paidKill !== 'true' && paidKill !== 'false')
    throw new LiveMintCapError(503, 'LIVE_MINT_CONFIG_INVALID');
  const parsed = configSchema.safeParse({
    freeSessionSeconds: integer(env.LIVE_FREE_SESSION_SECONDS, 180),
    actorDailyMints: integer(env.LIVE_ACTOR_DAILY_MINTS, 10),
    dailyBudgetMicroUsd: microUsd(env.LIVE_FREE_DAILY_USD_BUDGET ?? '50'),
    usdPerMinuteMicroUsd: microUsd(env.LIVE_FREE_USD_PER_MINUTE ?? '0.0368'),
    killSwitch: kill !== 'false',
    paidKillSwitch: paidKill === 'true',
    actorMaxConcurrent: integer(env.LIVE_ACTOR_MAX_CONCURRENT, 1),
  });
  if (!parsed.success)
    throw new LiveMintCapError(503, 'LIVE_MINT_CONFIG_INVALID');
  return parsed.data;
}

const resultSchema = z.union([
  z.tuple([
    z.literal(1),
    z.number().int().positive(),
    z.number().int().positive(),
    z.number().int().nonnegative(),
    z.number().int().nonnegative(),
    z.number().int().positive(),
    z.number().int().min(0).max(3),
    z.number().int().positive(),
  ]),
  z.tuple([
    z.literal(0),
    z.enum(['actor', 'budget', 'concurrency']),
    z.number().int().positive(),
    z.number().int().nonnegative(),
    z.number().int().positive(),
    z.number().int().min(0).max(3),
    z.number().int().positive(),
  ]),
]);
export interface LiveMintReservation {
  mintId: string;
  release: () => Promise<void>;
  freeSessionSeconds: number;
  expiresAt: string;
  reservedMicroUsd: number;
}
export interface LiveMintBudgetAlert {
  threshold: 80 | 100;
  day: string;
  reservedMicroUsd: number;
  limitMicroUsd: number;
}
export function createLiveMintGuard({
  getStore = getLiveMintStore,
  alert = async (event: LiveMintBudgetAlert) => {
    await sendLiveMintBudgetAlert(event);
  },
}: {
  getStore?: () => Promise<LiveMintStore | null>;
  alert?: (event: LiveMintBudgetAlert) => Promise<void>;
} = {}) {
  return async function reserve({
    actorId,
    isFree,
    config = readLiveMintConfig(),
  }: {
    actorId: string;
    isFree: boolean;
    config?: LiveMintConfig;
  }): Promise<LiveMintReservation> {
    if (
      !configSchema.safeParse(config).success ||
      !z.string().uuid().safeParse(actorId).success
    ) {
      throw new LiveMintCapError(503, 'LIVE_MINT_CONFIG_INVALID');
    }
    if (isFree ? config.killSwitch : config.paidKillSwitch)
      throw new LiveMintCapError(503, 'LIVE_MINT_DISABLED');
    const mintId = randomUUID();
    let response: unknown;
    let store: LiveMintStore;
    try {
      const selected = await getStore();
      if (!selected) throw new Error('Admission store missing');
      store = selected;
      response = await store.reserve({
        actorId,
        mintId,
        actorLimit: config.actorDailyMints,
        concurrentLimit: config.actorMaxConcurrent,
        durationMs: (isFree ? config.freeSessionSeconds : 300) * 1000,
        isFree,
        budgetLimit: config.dailyBudgetMicroUsd,
        rate: config.usdPerMinuteMicroUsd,
      });
    } catch (error) {
      // Failure class only: no actor, mint or digest values in logs.
      console.error('live_mint_store_unavailable', {
        code:
          error instanceof AbuseGuardUnavailableError ? error.code : 'error',
      });
      throw new LiveMintCapError(503, 'LIVE_MINT_STORE_UNAVAILABLE');
    }
    const decision = resultSchema.safeParse(response);
    if (!decision.success)
      throw new LiveMintCapError(503, 'LIVE_MINT_STORE_INVALID');
    const value = decision.data;
    const alertMask = value[0] === 1 ? value[6] : value[5];
    const day = value[0] === 1 ? value[7] : value[6];
    const spent = value[0] === 1 ? value[4] : value[3];
    const limit = value[0] === 1 ? value[5] : value[4];
    for (const threshold of [80, 100] as const) {
      if ((alertMask & (threshold === 80 ? 1 : 2)) === 0) continue;
      try {
        await alert({
          threshold,
          day: new Date(day * 86400000).toISOString().slice(0, 10),
          reservedMicroUsd: spent,
          limitMicroUsd: limit,
        });
      } catch {
        // Claimed means no blind duplicate after failed/unknown outbound send.
        console.error('live_mint_budget_alert_delivery_failed', { threshold });
      }
    }
    if (value[0] === 0)
      throw new LiveMintCapError(
        429,
        value[1] === 'budget'
          ? 'FREE_LIVE_DAILY_BUDGET_EXHAUSTED'
          : `LIVE_MINT_${value[1].toUpperCase()}_LIMIT`,
        value[2]
      );
    return {
      mintId,
      async release() {
        try {
          await store.release({ actorId, mintId });
        } catch {
          console.error('live_mint_lease_release_failed');
        }
      },
      freeSessionSeconds: config.freeSessionSeconds,
      expiresAt: new Date(value[2]).toISOString(),
      reservedMicroUsd: value[3],
    };
  };
}
export const reserveLiveMint = createLiveMintGuard();
