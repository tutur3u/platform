import {
  getTeachBootstrap,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import {
  createRequestLocal,
  maybeBridgeRequest,
} from '@tuturuuu/start-bridge/request-context/reader';

const bootstrap = createRequestLocal<ReturnType<typeof getTeachBootstrap>>(
  'Teach workspace bootstrap'
);

export function getTeachRequestBootstrap(requestHeaders: Headers) {
  const load = () =>
    getTeachBootstrap(withForwardedInternalApiAuth(requestHeaders));
  if (!maybeBridgeRequest()) return load();
  const existing = bootstrap.get();
  if (existing) return existing;
  const pending = load();
  bootstrap.set(pending);
  return pending;
}
