import type { RunOutcome } from '../ledger';

export interface ProcessorEnv {
  CRON_SECRET_INVENTORY: string;
  INVENTORY_ORIGIN: string;
  SUPABASE_SECRET_KEY: string;
  SUPABASE_URL: string;
}

export interface ProcessorContext {
  env: ProcessorEnv;
  fetch: typeof fetch;
  // False once the job is stopped or its generation changed.
  fence: () => Promise<boolean>;
  now: () => number;
  userAgent: string;
}

export interface ProcessorResult {
  detail: Record<string, number>;
  outcome: RunOutcome;
}
