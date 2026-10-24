import type { RunOutcome } from '../ledger';

export interface ProcessorEnv {
  CRON_SECRET_INVENTORY: string;
  INVENTORY_ORIGIN: string;
  SUPABASE_SECRET_KEY: string;
  SUPABASE_URL: string;
}

export interface ProcessorContext {
  /** Epoch ms by which every request must have finished (inside the lease). */
  deadline: number;
  env: ProcessorEnv;
  fetch: typeof fetch;
  // False once the job is stopped or its generation changed.
  fence: () => Promise<boolean>;
  now: () => number;
  /** Durable follow-up obligations, retried by later runs until settled. */
  pending: {
    add: (items: string[]) => Promise<void>;
    list: () => Promise<string[]>;
    settle: (items: string[]) => Promise<void>;
  };
  userAgent: string;
}

export interface ProcessorResult {
  detail: Record<string, number>;
  outcome: RunOutcome;
}
