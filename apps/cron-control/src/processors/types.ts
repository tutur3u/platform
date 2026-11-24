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
  /** Account id the Cloudflare analytics collector reads (config text). */
  CLOUDFLARE_ACCOUNT_ID?: string;
  /** Read-only Account Analytics token for the Cloudflare collector. */
  CLOUDFLARE_ANALYTICS_API_TOKEN?: string;
  /** Exactly 'delete' runs Forms upload cleanup; any other value is off. */
  FORMS_UPLOAD_CLEANUP_MODE?: string;
  /** Read-only Actions token; used only when no GitHub App variable is set. */
  GITHUB_ACTIONS_READ_TOKEN?: string;
  /** tutur3u-owned GitHub App for the GitHub Actions collector (secrets). */
  GITHUB_APP_ID?: string;
  GITHUB_APP_INSTALLATION_ID?: string;
  /** PEM private key (PKCS#1 or PKCS#8); literal "\n" escapes are accepted. */
  GITHUB_APP_PRIVATE_KEY?: string;
  /** Service binding to the Meet realtime `AttendanceErasure` entrypoint. */
  MEET_ATTENDANCE_ERASURE?: MeetAttendanceErasureBinding;
  MOBILE_CRASHLYTICS_BIGQUERY?: string;
  MOBILE_CRASHLYTICS_FIX_BUILDS?: string;
  MOBILE_CRASHLYTICS_MODE?: string;
  MOBILE_CRASHLYTICS_UNTIL?: string;
  SUPABASE_SECRET_KEY: string;
  SUPABASE_URL: string;
  TASKS_RECURRENCE_MODE?: string;
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
  /** Minute-normalized ISO timestamp of the admitted scheduled tick. */
  slot?: string;
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
