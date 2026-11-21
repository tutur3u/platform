import { currentOwner } from '../native/context';

/**
 * The admitted caller whose short-lived Mastermind session reaches the Fleet
 * API. The Fleet API decides every read and write from that session's user.
 */
export function currentFleetActor() {
  return currentOwner();
}
