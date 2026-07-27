export type AiStudioPolicyState = 'inherit' | 'enabled' | 'disabled';

export interface AiStudioGlobalSettings {
  captureDefaultEnabled: boolean;
  contentRetentionDays: number;
  defaultModels: string[];
  globallyEnabled: boolean;
  metadataRetentionDays: number;
  workspaceDefaultEnabled: boolean;
}

export interface AiStudioWorkspacePolicy {
  allowedModels: string[];
  captureEnabled: boolean | null;
  contentRetentionDays: number | null;
  deniedModels: string[];
  metadataRetentionDays: number | null;
  monthlyCreditBudget: number | null;
  noTrainingEnforced: boolean;
  requestsPerMinute: number | null;
  state: AiStudioPolicyState;
  workspaceName: string;
  wsId: string;
}
