import type { DeliveredAuditEvent, RunOutcome } from '../ledger';
import type { MeetAttendanceErasureBinding } from './meet-attendance-erasure';

export interface ProcessorEnv {
  /** Read-only billing collector credentials; a source runs only when set. */
  COST_GITHUB_ORG?: string;
  COST_GITHUB_TOKEN?: string;
  COST_VERCEL_API_TOKEN?: string;
  COST_VERCEL_TEAM_ID?: string;
  /** Exactly 'off', 'dry-run' or 'delete'; any other value (including unset) means off. */
  AI_STUDIO_RETENTION_MODE?: string;
  /** Service binding to the Meet realtime `AttendanceErasure` entrypoint. */
  MEET_ATTENDANCE_ERASURE?: MeetAttendanceErasureBinding;
  SUPABASE_SECRET_KEY: string;
  SUPABASE_URL: string;
}

export interface ProcessorContext {
  chatDeliveredCursor?: DeliveredAuditEvent[];
  /** Epoch ms bounding the whole run, including ledger RPCs (inside the lease). */
  deadline: number;
  env: ProcessorEnv;
  fetch: typeof fetch;
  // False once the job is stopped or its generation changed.
  fence: () => Promise<boolean>;
  now: () => number;
  signal?: AbortSignal;
  /** Backoff between bounded in-run retries; defaults to a timer. */
  sleep?: (milliseconds: number) => Promise<void>;
  /** Durable follow-up obligations, retried by later runs until settled. */
  pending: {
    add: (items: string[]) => Promise<void>;
    list: () => Promise<string[]>;
    fail: (items: string[]) => Promise<string[]>;
    quarantined: () => Promise<string[]>;
    settle: (items: string[]) => Promise<void>;
  };
  target: { secret: string; url: URL };
  userAgent: string;
}

export interface ProcessorResult {
  chatDeliveredCursor?: DeliveredAuditEvent[];
  detail: Record<string, number>;
  outcome: RunOutcome;
}
