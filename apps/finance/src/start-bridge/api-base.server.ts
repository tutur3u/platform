import { registerDefaultAppBaseResolver } from '@tuturuuu/internal-api/client';
import { bridgeRequest } from '@tuturuuu/start-bridge/request-context';
import { financeApiPath } from './api-base';

export function resolveFinanceServerApiUrl(path: string): string {
  return new URL(financeApiPath(path), bridgeRequest().request.url).toString();
}

const unregister = registerDefaultAppBaseResolver(resolveFinanceServerApiUrl);
import.meta.hot?.dispose(unregister);
