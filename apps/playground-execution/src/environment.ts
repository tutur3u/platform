import type { PlaygroundChecker } from './checker';
import type { PlaygroundCoordinator } from './coordinator';
import type { PlaygroundSlot } from './slot';

export interface Env {
  PLAYGROUND_COORDINATOR: DurableObjectNamespace<PlaygroundCoordinator>;
  PLAYGROUND_SLOT: DurableObjectNamespace<PlaygroundSlot>;
  PLAYGROUND_CHECKER: DurableObjectNamespace<PlaygroundChecker>;
  PLAYGROUND_SOURCE_ORIGIN?: string;
  PLAYGROUND_INGRESS_SECRET?: string;
  PLAYGROUND_OPERATOR_SECRET?: string;
  PLAYGROUND_MAX_CONCURRENT?: string;
  PLAYGROUND_MAX_CONCURRENT_PER_USER?: string;
  PLAYGROUND_MAX_RUNS_PER_USER_10_MINUTES?: string;
  PLAYGROUND_MAX_STARTS_PER_UTC_DAY?: string;
  PLAYGROUND_MAX_CHECKS_PER_UTC_DAY?: string;
}

export const singleton = 'playground-coordinator';

export function coordinator(env: Env) {
  return env.PLAYGROUND_COORDINATOR.getByName(singleton);
}

export function roomChecker(env: Env, meetingId: string) {
  return env.PLAYGROUND_CHECKER.getByName(`room-${meetingId}`);
}

export function executionSlot(env: Env, slot: number) {
  return env.PLAYGROUND_SLOT.getByName(`slot-${slot}`);
}
