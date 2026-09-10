import type { LiveSessionClaims } from '../../src/features/live-assistant/contracts';
import type { LiveBillingState } from './billing';
import { type LiveRoomIdentity, liveRoomCommand } from './room';
import type { LiveEnvironment } from './storage';

export function reportLiveUsage(
  env: LiveEnvironment,
  claims: LiveSessionClaims,
  identity: LiveRoomIdentity,
  billing: LiveBillingState
) {
  return liveRoomCommand(env, claims, identity, {
    action: 'live.usage',
    id: billing.id,
    sequence: billing.sequence,
    costUsd: Math.max(0, billing.costUsd - (billing.previousCostUsd ?? 0)),
    incomplete: billing.incomplete,
  });
}
