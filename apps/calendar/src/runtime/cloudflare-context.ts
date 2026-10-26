import { getCloudflareContext as bridgeCloudflareContext } from '@tuturuuu/start-bridge/next/cloudflare-context';
import type {
  CalendarExecutionContext,
  CalendarWorkerEnvironment,
} from './worker-contract';
export function getCloudflareContext(options?: { async?: boolean }) {
  return bridgeCloudflareContext<
    CalendarWorkerEnvironment,
    CalendarExecutionContext
  >(options);
}
