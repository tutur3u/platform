import { getCloudflareContext as getBridgeCloudflareContext } from '@tuturuuu/start-bridge/next/cloudflare-context';
import type { MeetExecutionContext, MeetRuntimeBindings } from './worker-port';

export function getCloudflareContext(options?: { async?: boolean }) {
  return getBridgeCloudflareContext<MeetRuntimeBindings, MeetExecutionContext>(
    options
  );
}
