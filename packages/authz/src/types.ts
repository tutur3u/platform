// Types for the deny-by-default authorization engine. Identity, storage and
// clocks are injected; nothing here imports a framework or runtime.

export type Action =
  | 'read'
  | 'list'
  | 'create'
  | 'update'
  | 'delete'
  | (string & {});

/**
 * How the caller proved who it is. An identity assertion carries assurance
 * facts; an access token carries OAuth scopes and a workspace allowlist and
 * never has assurance facts synthesised for it.
 */
export type Credential =
  | {
      kind: 'identity';
      aal: 'aal1' | 'aal2';
      amr: readonly string[];
      /** Epoch seconds. */
      authTime: number;
    }
  | {
      kind: 'access';
      scopes: readonly string[];
      allowedWsIds: readonly string[];
    };

/** User principals only; API-key and guest principals are a later slice. */
export type AuthzPrincipal = Readonly<{
  kind: 'user';
  userId: string;
  appId: string;
  credential: Credential;
  /** Epoch seconds after which the principal must not be used. */
  expiresAt: number;
}>;

export type Resource = Readonly<{
  type: string;
  wsId: string;
  id?: string;
  /** Row image before a write (or the row being read). */
  before?: Readonly<Record<string, unknown>>;
  /** Row image after a write. */
  after?: Readonly<Record<string, unknown>>;
}>;

export type Rule =
  | { kind: 'permission'; permission: string }
  | { kind: 'member' }
  | { kind: 'owner'; column: string }
  | { kind: 'aal2' }
  | { kind: 'all'; rules: readonly Rule[] }
  | { kind: 'any'; rules: readonly Rule[] };

export type Policy = Readonly<{
  type: string;
  /** A missing action denies. */
  actions: Readonly<Partial<Record<Action, Rule>>>;
  /** OAuth scope each action needs from an access credential. */
  scopes?: Readonly<Partial<Record<Action, string>>>;
}>;

export type DenyReason =
  | 'expired'
  | 'no_policy'
  | 'no_scope_mapping'
  | 'missing_scope'
  | 'outside_token_workspaces'
  | 'foreign_workspace'
  | 'not_member'
  | 'unknown_permission'
  | 'rule'
  | 'source_error'
  | 'version_missing'
  | 'version_deleted'
  | 'stale_resolve'
  | 'snapshot_mismatch'
  | 'evaluation_error';

export type Decision =
  | { allow: true }
  | { allow: false; reason: DenyReason; as: 'not_found' | 'forbidden' };

export type VersionKey = Readonly<{ kind: 'user'; id: string }>;

export type Versions = Readonly<{ principal: bigint; workspace: bigint }>;

export type VersionRead =
  | { ok: true; versions: Versions }
  | { ok: false; reason: 'missing' | 'deleted' };

export type PermissionSnapshot = Readonly<{
  wsId: string;
  member: boolean;
  permissions: ReadonlySet<string>;
}>;

export type ResolveResult =
  | { ok: true; versions: Versions; snapshot: PermissionSnapshot }
  | { ok: false; reason: 'missing' | 'deleted' };

/**
 * Where memberships and permissions come from. `resolve` must read the
 * versions and the snapshot in one statement. Implementations throw on read
 * errors and timeouts; the engine turns every throw into a deny.
 */
export interface PermissionSource {
  versions(key: VersionKey, wsId: string): Promise<VersionRead>;
  resolve(key: VersionKey, wsId: string): Promise<ResolveResult>;
}
