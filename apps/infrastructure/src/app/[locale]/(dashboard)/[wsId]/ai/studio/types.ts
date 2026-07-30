import type { InfrastructureAiStudioWorkspacePolicy } from '@tuturuuu/internal-api/infrastructure';

export interface AiStudioGlobalSettings {
  captureDefaultEnabled: boolean;
  contentRetentionDays: number;
  defaultModels: string[];
  metadataRetentionDays: number;
}

export type AiStudioWorkspacePolicy = InfrastructureAiStudioWorkspacePolicy;
