/**
 * The RPC contract of the tuturuuu-workspace-secrets Worker
 * (apps/workspace-secrets), shared by the Worker and its callers.
 */

export type WorkspaceSecretRevealPurpose =
  | 'ai-agents'
  | 'discord-watcher'
  | 'mobile-calendar'
  | 'storage';

export type WorkspaceSecretFailure =
  | { status: 'invalid' }
  | { status: 'forbidden' }
  | { status: 'not_credential' }
  | { status: 'not_found' }
  | { status: 'conflict'; currentValueRev: number | null }
  | { status: 'unavailable' };

export type WorkspaceSecretPutResult =
  | { status: 'ok'; secretId: string; valueRev: number; last4: string }
  | WorkspaceSecretFailure;

export type WorkspaceSecretRevealResult =
  | { status: 'ok'; value: string; valueRev: number }
  | WorkspaceSecretFailure;

export type WorkspaceSecretKeyStatusResult =
  | { status: 'ok'; keyStatus: 'active' | 'invalid' | 'missing' }
  | WorkspaceSecretFailure;

export interface WorkspaceSecretPutInput {
  wsId: string;
  name: string;
  value: string;
  /** Omit to create; the Worker then chooses the row id. */
  secretId?: string;
  /** The row's current value_rev; omit to create. */
  expectedValueRev?: number;
  /**
   * Identifies one write. The Worker's own database retries reuse it, so a
   * write that already landed replays instead of conflicting. A create
   * retried by the caller is a new request (the Worker picks a new row id)
   * and reports a conflict if the first one landed.
   */
  requestId: string;
}

export interface WorkspaceSecretRenameInput {
  wsId: string;
  secretId: string;
  fromName: string;
  toName: string;
  expectedValueRev: number;
  requestId: string;
}

export interface WorkspaceSecretRevealInput {
  wsId: string;
  name: string;
  purpose: WorkspaceSecretRevealPurpose;
}

export interface WorkspaceSecretKeyStatusInput {
  wsId: string;
  keyId: string;
}

/** A service binding to one of the Worker's named entrypoints. */
export interface WorkspaceSecretsBinding {
  put(input: WorkspaceSecretPutInput): Promise<WorkspaceSecretPutResult>;
  rename(input: WorkspaceSecretRenameInput): Promise<WorkspaceSecretPutResult>;
  reveal(
    input: WorkspaceSecretRevealInput
  ): Promise<WorkspaceSecretRevealResult>;
  keyStatus(
    input: WorkspaceSecretKeyStatusInput
  ): Promise<WorkspaceSecretKeyStatusResult>;
}
