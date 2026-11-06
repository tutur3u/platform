import type { AssetsBinding } from '@tuturuuu/start-bridge/assets';

export interface MailRuntimeEnv {
  ASSETS: AssetsBinding;
}
export interface MailExecutionContext {
  waitUntil(work: Promise<unknown>): void;
}
