// In-memory PermissionSource for tests. Not for production use.

import type {
  PermissionSnapshot,
  PermissionSource,
  ResolveResult,
  VersionKey,
  VersionRead,
  Versions,
} from './types';

type Membership = { permissions: Set<string> };

export class InMemoryPermissionSource implements PermissionSource {
  readonly users = new Map<string, { version: bigint; deleted: boolean }>();
  readonly workspaces = new Map<
    string,
    { version: bigint; deleted: boolean }
  >();
  readonly members = new Map<string, Membership>();
  /** Set to make every call throw, like a Hyperdrive timeout. */
  fail = false;
  calls = { versions: 0, resolve: 0 };

  addWorkspace(wsId: string) {
    this.workspaces.set(wsId, { version: 1n, deleted: false });
  }

  addUser(userId: string) {
    this.users.set(userId, { version: 1n, deleted: false });
  }

  grant(userId: string, wsId: string, permissions: string[] = []) {
    const id = `${userId}\u0000${wsId}`;
    const existing = this.members.get(id) ?? { permissions: new Set() };
    for (const permission of permissions) existing.permissions.add(permission);
    this.members.set(id, existing);
    this.bump(userId, wsId);
  }

  revoke(userId: string, wsId: string) {
    this.members.delete(`${userId}\u0000${wsId}`);
    this.bump(userId, wsId);
  }

  bump(userId: string, wsId: string) {
    const user = this.users.get(userId);
    if (user) user.version += 1n;
    const workspace = this.workspaces.get(wsId);
    if (workspace) workspace.version += 1n;
  }

  #read(key: VersionKey, wsId: string): VersionRead {
    const user = this.users.get(key.id);
    const workspace = this.workspaces.get(wsId);
    if (!user || !workspace) return { ok: false, reason: 'missing' };
    if (user.deleted || workspace.deleted)
      return { ok: false, reason: 'deleted' };
    const versions: Versions = {
      principal: user.version,
      workspace: workspace.version,
    };
    return { ok: true, versions };
  }

  async versions(key: VersionKey, wsId: string): Promise<VersionRead> {
    this.calls.versions += 1;
    if (this.fail) throw new Error('source unavailable');
    return this.#read(key, wsId);
  }

  async resolve(key: VersionKey, wsId: string): Promise<ResolveResult> {
    this.calls.resolve += 1;
    if (this.fail) throw new Error('source unavailable');
    const read = this.#read(key, wsId);
    if (!read.ok) return read;
    const membership = this.members.get(`${key.id}\u0000${wsId}`);
    const snapshot: PermissionSnapshot = {
      wsId,
      member: membership !== undefined,
      permissions: new Set(membership?.permissions ?? []),
    };
    return { ok: true, versions: read.versions, snapshot };
  }
}
