/** External app registry shapes for the infrastructure admin API. */

export interface ExternalAppRegistration {
  allowedScopes: string[];
  allowedWorkspaceIds: string[];
  createdAt: string | null;
  createdBy: string | null;
  displayName: string;
  enabled: boolean;
  id: string;
  /** Public https logo for sign-in screens; null shows a neutral glyph. */
  logoUrl?: string | null;
  origins: string[];
  secretIssuedAt: string | null;
  secretLastFour: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface ExternalAppsResponse {
  apps: ExternalAppRegistration[];
}

export interface SaveExternalAppPayload {
  allowedScopes?: string[];
  allowedWorkspaceIds?: string[];
  displayName: string;
  enabled: boolean;
  id: string;
  issueSecret?: boolean;
  /** Omitted keeps the stored logo; null or an empty string clears it. */
  logoUrl?: string | null;
  origins: string[];
}

export interface SaveExternalAppResponse {
  app: ExternalAppRegistration;
  secret: string | null;
}

export interface ApproveExternalAppManagedCronPayload {
  origin: string;
}

export interface ApproveExternalAppManagedCronResponse {
  domain: string;
  enabled: boolean;
}
