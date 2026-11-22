import type { FleetDecision } from './contract';

export const fleetPushPreference = {
  urgent: 'mastermind_inbox_urgent',
  decision: 'mastermind_inbox_decision',
  fyi: 'mastermind_inbox_fyi',
} as const;

export function fleetPushCategory(urgency: FleetDecision['urgency']) {
  if (urgency === 'fyi' || urgency === 'urgent') return urgency;
  return 'decision';
}
