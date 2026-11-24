/**
 * The Durable Object calls the sign handler makes, and the isolate guards
 * around them. A `stopped` fence is remembered for `STOPPED_HOLD_MS` and an
 * exhausted budget until its retry time, so a flood against a stopped or
 * exhausted signer costs no Durable Object calls. `running` is never
 * cached: a stop takes effect on the next request.
 */
import type { ReserveResult } from './budget-store';
import type { FenceMode } from './fence-store';
import type { ClaimResult, ClaimToken } from './replay-store';

export const STOPPED_HOLD_MS = 10_000;

export interface ControlPort {
  fenceMode(): Promise<FenceMode>;
}
export interface BudgetPort {
  reserve(nowMs: number): Promise<ReserveResult>;
}
export interface ReplayPort {
  claim(tokens: readonly ClaimToken[], nowMs: number): Promise<ClaimResult>;
}

export function guardPorts(input: {
  control: ControlPort;
  budget: BudgetPort;
  now: () => number;
}): { control: ControlPort; budget: BudgetPort } {
  let stoppedUntilMs = 0;
  let exhaustedUntilMs = 0;
  return {
    control: {
      async fenceMode() {
        if (input.now() < stoppedUntilMs) return 'stopped';
        const mode = await input.control.fenceMode();
        if (mode !== 'running') stoppedUntilMs = input.now() + STOPPED_HOLD_MS;
        return mode;
      },
    },
    budget: {
      async reserve(nowMs) {
        if (nowMs < exhaustedUntilMs) {
          return {
            ok: false,
            error: 'budget_exhausted',
            retryAtMs: exhaustedUntilMs,
          };
        }
        const result = await input.budget.reserve(nowMs);
        if (!result.ok) exhaustedUntilMs = result.retryAtMs;
        return result;
      },
    },
  };
}
