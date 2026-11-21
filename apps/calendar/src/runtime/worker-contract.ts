export interface CalendarWorkerEnvironment {
  ASSETS: { fetch(request: Request): Promise<Response> };
  /**
   * Shared abuse guard over RPC (`tuturuuu-abuse-guard`, AbuseGuardEntrypoint).
   * Structural so the Worker type program does not load the guard client.
   */
  ABUSE_GUARD?: { run(rpc: never): Promise<unknown> };
  /** Optional secret; without it the assigned families report `off`. */
  ABUSE_GUARD_KEY_PEPPER?: string;
  ABUSE_GUARD_FAMILIES?: string;
  ABUSE_GUARD_TIMEOUT_MS?: string;
  /** Staging only: Access team domain and application AUD for JWT checks. */
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  /** Staging only: service token for server-side calls to the issuer. */
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
  /**
   * `off` | `shadow` | `on`. Absent fails closed to `off`.
   * Production shadow keeps `calendar.tuturuuu.com` serving.
   */
  TTR_ONE_ORIGIN_CALENDAR?: string;
}
export interface CalendarExecutionContext {
  waitUntil(work: Promise<unknown>): void;
}
