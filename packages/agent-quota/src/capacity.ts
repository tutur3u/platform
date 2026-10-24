import type { Observation } from './hooks-types';

export const CAPACITY_COOLDOWN_MS = 30 * 60_000;
export function capacityCooldownActive(
  event: Observation,
  model: string | undefined,
  now: Date
): boolean {
  if (event.outcome !== 'capacity-error' || !model || event.model !== model)
    return false;
  const deadline = event.nextEligibleAt
    ? Date.parse(event.nextEligibleAt)
    : Date.parse(event.observedAt) + CAPACITY_COOLDOWN_MS;
  return now.getTime() < deadline;
}
