export type OrchestratorRole = 'main' | 'child';

export interface RoleChoice<T> {
  candidate?: T;
  reason?:
    | 'healthy-claude-preferred'
    | 'main-role-no-eligible-claude'
    | 'explicit-non-claude-fallback';
}

export function rolePreferenceRank(
  role: OrchestratorRole | undefined,
  provider: string,
  eligibleHealthy: boolean
): number {
  return role === 'main' && provider === 'claude' && eligibleHealthy ? 1 : 0;
}

export function chooseRoleCandidate<T extends { provider: string }>(
  role: OrchestratorRole | undefined,
  eligible: T[],
  allowNonClaudeFallback = false
): RoleChoice<T> {
  if (role !== 'main') return { candidate: eligible[0] };
  const claude = eligible.find((candidate) => candidate.provider === 'claude');
  if (claude) return { candidate: claude, reason: 'healthy-claude-preferred' };
  if (allowNonClaudeFallback && eligible[0])
    return {
      candidate: eligible[0],
      reason: 'explicit-non-claude-fallback',
    };
  return { reason: 'main-role-no-eligible-claude' };
}
