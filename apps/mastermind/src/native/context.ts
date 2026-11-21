import {
  createRequestLocal,
  withBridgeRequest,
} from '@tuturuuu/start-bridge/request-context';
import type { Owner } from './auth';

const identity = createRequestLocal<Owner>('mastermind owner');
export function withOwner<T>(
  request: Request,
  owner: Owner,
  run: () => T,
  options: { nonce?: string; appBase?: string } = {}
) {
  return withBridgeRequest({ request, ...options }, () => {
    identity.set(owner);
    return run();
  });
}
export function currentOwner() {
  const owner = identity.get();
  if (!owner) throw new Error('Missing authenticated owner');
  return owner;
}
