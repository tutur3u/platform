import {
  createRequestLocal,
  withBridgeRequest,
} from '@tuturuuu/start-bridge/request-context';
import type { Admitted, Owner } from './auth';

const identity = createRequestLocal<Owner>('mastermind owner');
const fleetActor = createRequestLocal<Owner>('mastermind fleet actor');

/** Only the owner role sets the owner identity; every role is a Fleet actor. */
export function withOwner<T>(
  request: Request,
  owner: Admitted,
  run: () => T,
  options: { nonce?: string; appBase?: string } = {}
) {
  return withBridgeRequest({ request, ...options }, () => {
    if (owner.role === 'owner') identity.set(owner);
    fleetActor.set(owner);
    return run();
  });
}
export function currentOwner() {
  const owner = identity.get();
  if (!owner) throw new Error('Missing authenticated owner');
  return owner;
}
/** The owner or a Fleet grantee; the Fleet API authorizes each call. */
export function currentFleetActor() {
  const actor = fleetActor.get();
  if (!actor) throw new Error('Missing authenticated Fleet actor');
  return actor;
}
