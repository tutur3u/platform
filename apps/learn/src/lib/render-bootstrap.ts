import {
  getConfiguredLearnApiBaseUrl,
  getTulearnBootstrap,
  InternalApiError,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import {
  createRequestLocal,
  maybeBridgeRequest,
} from '@tuturuuu/start-bridge/request-context/reader';
import { headers } from 'next/headers';

const renderBootstrap = createRequestLocal<
  Map<string | undefined, ReturnType<typeof getTulearnBootstrap>>
>('Learn render bootstrap');

async function loadBootstrap(baseUrl?: string) {
  return getTulearnBootstrap(
    withForwardedInternalApiAuth(await headers(), { baseUrl })
  );
}

export function getLearnRenderBootstrap(useConfiguredOrigin = false) {
  const baseUrl = useConfiguredOrigin
    ? getConfiguredLearnApiBaseUrl()
    : undefined;
  if (!maybeBridgeRequest()) return loadBootstrap(baseUrl);

  let pending = renderBootstrap.get();
  if (!pending) {
    pending = new Map();
    renderBootstrap.set(pending);
  }
  const existing = pending.get(baseUrl);
  if (existing) return existing;
  const bootstrap = loadBootstrap(baseUrl);
  pending.set(baseUrl, bootstrap);
  return bootstrap;
}

export function isLearnBootstrapAuthFailure(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    error instanceof InternalApiError &&
    'status' in error &&
    (error.status === 401 || error.status === 403)
  );
}
