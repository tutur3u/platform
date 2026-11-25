import { getCloudflareContext as bridgeCloudflareContext } from '@tuturuuu/start-bridge/next/cloudflare-context';
import type {
  CalendarExecutionContext,
  CalendarWorkerEnvironment,
} from './worker-contract';

type CalendarCloudflareContext = {
  env: CalendarWorkerEnvironment;
  ctx: CalendarExecutionContext;
};

/** The bridge shim typed for Calendar; `{ async: true }` returns a Promise. */
export function getCloudflareContext(options: {
  async: true;
}): Promise<CalendarCloudflareContext>;
export function getCloudflareContext(options?: {
  async?: false;
}): CalendarCloudflareContext;
export function getCloudflareContext(options?: {
  async?: boolean;
}): CalendarCloudflareContext | Promise<CalendarCloudflareContext>;
export function getCloudflareContext(options?: { async?: boolean }) {
  return bridgeCloudflareContext<
    CalendarWorkerEnvironment,
    CalendarExecutionContext
  >(options);
}
