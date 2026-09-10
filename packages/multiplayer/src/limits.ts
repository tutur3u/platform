export type TeamLimits = {
  aiCallLimit: number;
  agentTurnLimit: number;
  toolCallLimit: number;
};

export type WorkshopLimits = TeamLimits;

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
