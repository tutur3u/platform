export interface AiStudioGlobalSettings {
  captureDefaultEnabled: boolean;
  contentRetentionDays: number;
  defaultModels: string[];
  metadataRetentionDays: number;
}

export interface AiStudioWorkspacePolicy {
  allowedModels: string[];
  apiKeyCreationApproved: boolean;
  apiKeyCreationDecidedAt: string | null;
  apiKeyCreationDecidedBy: string | null;
  captureEnabled: boolean | null;
  contentRetentionDays: number | null;
  deniedModels: string[];
  metadataRetentionDays: number | null;
  monthlyCreditBudget: number | null;
  noTrainingEnforced: boolean;
  requestsPerMinute: number | null;
  workspaceName: string;
  wsId: string;
}
