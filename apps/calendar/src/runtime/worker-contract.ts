export interface CalendarWorkerEnvironment {
  /** Missing or invalid values refuse the apex; observation redirects use 307. */
  TTR_ONE_ORIGIN_CALENDAR?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Staging only: Access team domain and application AUD for JWT checks. */
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  /** Staging only: service token for server-side calls to the issuer. */
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
}
export interface CalendarExecutionContext {
  waitUntil(work: Promise<unknown>): void;
}
