export type TeamLimits = {
  aiCallLimit: number;
  agentTurnLimit: number;
  toolCallLimit: number;
};

export type WorkshopLimits = TeamLimits;

export type WorkshopScheduleError =
  | 'invalid'
  | 'start_too_old'
  | 'start_too_far'
  | 'end_too_soon'
  | 'end_too_late';

export const defaultWorkshopLimits: WorkshopLimits = {
  aiCallLimit: 500,
  agentTurnLimit: 16,
  toolCallLimit: 12,
};

export const defaultTeamLimits: TeamLimits = {
  aiCallLimit: 150,
  agentTurnLimit: 12,
  toolCallLimit: 10,
};

export const maximumWorkshopLimits: WorkshopLimits = {
  aiCallLimit: 5000,
  agentTurnLimit: 40,
  toolCallLimit: 30,
};

export function normalizeStoredLimits(
  stored: Partial<TeamLimits> | undefined,
  fallback: TeamLimits,
  maximum = maximumWorkshopLimits
): TeamLimits {
  const valid = (value: unknown, minimum: number, defaultValue: number) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
      ? value
      : defaultValue;
  const limits = {
    aiCallLimit: valid(stored?.aiCallLimit, 1, fallback.aiCallLimit),
    agentTurnLimit: valid(stored?.agentTurnLimit, 2, fallback.agentTurnLimit),
    toolCallLimit: valid(stored?.toolCallLimit, 0, fallback.toolCallLimit),
  };
  const agentTurnLimit = Math.min(
    limits.agentTurnLimit,
    maximum.agentTurnLimit
  );
  return {
    aiCallLimit: Math.min(limits.aiCallLimit, maximum.aiCallLimit),
    agentTurnLimit,
    toolCallLimit: Math.min(
      limits.toolCallLimit,
      maximum.toolCallLimit,
      Math.max(agentTurnLimit - 1, 0)
    ),
  };
}
