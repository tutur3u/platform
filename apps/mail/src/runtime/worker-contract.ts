import type { AssetsBinding } from '@tuturuuu/start-bridge/assets';

export interface MailRuntimeEnv {
  ASSETS: AssetsBinding;
  /** Staging only: Access team domain and application AUD for JWT checks. */
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  /** Staging only: service token for server-side calls to the issuer. */
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
}
export interface MailExecutionContext {
  waitUntil(work: Promise<unknown>): void;
}
