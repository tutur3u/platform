/**
 * Passwords service port.
 *
 * The app renders and validates against this contract only. The parent
 * integration supplies the single implementation in `adapter.server.ts`:
 * it verifies the Passwords app session (target `passwords`), rechecks workspace
 * membership and vault role, enforces step-up, and calls the atomic vault
 * operations. Nothing in the app fakes a success or reads secrets elsewhere.
 */

export const VAULT_ROLES = ['owner', 'editor', 'viewer'] as const;
export type VaultRole = (typeof VAULT_ROLES)[number];

export const PASSWORDS_LIMITS = {
  nameMaxLength: 120,
  itemMaxBytes: 1024 * 1024,
  /** Seconds a verified MFA proof stays fresh for reveal, sharing and rotation. */
  stepUpMaxAgeSeconds: 300,
} as const;

export const PASSWORDS_ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'STEP_UP_REQUIRED',
  'REVISION_CONFLICT',
  'INVALID_INPUT',
  'TOO_LARGE',
  'RATE_LIMITED',
  'STOPPED',
  'UNAVAILABLE',
  'OPERATION_UNCERTAIN',
] as const;
export type PasswordsErrorCode = (typeof PASSWORDS_ERROR_CODES)[number];

export type PasswordsFailure = {
  ok: false;
  code: PasswordsErrorCode;
  retryAfterSeconds?: number;
  /** Set with STEP_UP_REQUIRED: the central MFA step-up page for this app. */
  stepUpUrl?: string;
};
export type PasswordsResult<T> = { ok: true; value: T } | PasswordsFailure;

export type StepUpStatus =
  | { state: 'valid'; expiresAt: string }
  | { state: 'required'; url: string };

export interface VaultSummary {
  id: string;
  name: string;
  role: VaultRole;
  /** Compare-and-swap token for putItem, setMember and rotateVault. */
  revision: number;
  keyVersion: number;
  rotationRequired: boolean;
  itemCount?: number;
}

export interface ItemSummary {
  id: string;
  /** The label. Never a secret value. */
  name: string;
  version: number;
  byteLength?: number;
  updatedAt?: string;
  updatedBy?: string;
}

export interface MemberSummary {
  userId: string;
  displayName: string | null;
  role: VaultRole;
  revoked: boolean;
}

export interface WorkspaceMemberOption {
  userId: string;
  displayName: string | null;
}

export interface VaultDetail {
  summary: VaultSummary;
  items: ItemSummary[];
  /** Empty unless the actor is an owner. */
  members: MemberSummary[];
  workspaceMembers: WorkspaceMemberOption[];
}

export interface PasswordsState {
  workspaceName: string | null;
  vaults: VaultSummary[];
  vault: VaultDetail | null;
  stepUp: StepUpStatus;
}

export const AUDIT_EVENT_TYPES = [
  'vault.create',
  'vault.rename',
  'vault.list',
  'item.read',
  'item.list',
  'item.write',
  'item.delete',
  'key.read',
  'member.set',
  'member.list',
  'member.workspace_revoke',
  'rotation.snapshot',
  'vault.rotate',
  'grant.create',
  'grant.revoke',
  'token.issue',
  'audit.list',
  'request.status',
] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];

/** Metadata only: no filenames, client messages or free-form fields. */
export interface AuditEvent {
  id: string;
  type: AuditEventType;
  at: string;
  actorId: string;
  actorName: string | null;
  resourceId: string | null;
}

export interface RevealedItem {
  base64: string;
  byteLength: number;
}

export interface MutationOutcome {
  /** The vault revision after the operation committed or replayed. */
  revision: number;
}

type Scope = { wsId: string };
type VaultScope = Scope & { vaultId: string };
type Mutation = { requestId: string };
type Guarded = Mutation & { revision: number };

export interface OperationObservation {
  found: boolean;
  action?: string;
  receipt?: { vaultId?: string; revision?: number; itemId?: string };
}

export interface PasswordsServicePort {
  observeOperation(
    input: VaultScope & { targetRequestId: string }
  ): Promise<PasswordsResult<OperationObservation>>;
  state(
    input: Scope & { vaultId?: string }
  ): Promise<PasswordsResult<PasswordsState>>;
  createVault(
    input: Scope & Mutation & { name: string }
  ): Promise<PasswordsResult<{ vaultId: string }>>;
  putItem(
    input: VaultScope & Guarded & { name: string; base64: string }
  ): Promise<PasswordsResult<MutationOutcome & { itemId: string }>>;
  revealItem(
    input: VaultScope & Mutation & { itemId: string }
  ): Promise<PasswordsResult<RevealedItem>>;
  setMember(
    input: VaultScope &
      Guarded & { userId: string; role: VaultRole; revoked: boolean }
  ): Promise<PasswordsResult<MutationOutcome>>;
  rotateVault(
    input: VaultScope & Guarded
  ): Promise<PasswordsResult<MutationOutcome>>;
  audit(input: VaultScope): Promise<PasswordsResult<AuditEvent[]>>;
}

/**
 * Per-process seam implemented by the parent in `adapter.server.ts`.
 * `edge` serves session endpoints before Start; `service` is bound to one request.
 */
export interface PasswordsRuntime {
  edge: { handle(request: Request): Promise<Response | null> };
  service(request: Request): PasswordsServicePort;
}
