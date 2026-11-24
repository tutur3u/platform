import {
  createInternalApiClient,
  encodePathSegment,
  type InternalApiClientOptions,
} from '@tuturuuu/internal-api/client';
import { z } from 'zod';

const permission = z.object({ id: z.string(), enabled: z.boolean() });
const roleSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  permissions: z.array(permission).default([]),
});
const memberSchema = z.object({
  id: z.string(),
  email: z.string().nullable().optional(),
  display_name: z.string().nullable().optional(),
});

export type WorkspaceRoleSummary = z.infer<typeof roleSchema>;
export type WorkspaceRoleMember = z.infer<typeof memberSchema>;

export const rolesPath = (wsId: string) =>
  `/api/v1/workspaces/${encodePathSegment(wsId)}/roles`;
export const rolePath = (wsId: string, roleId: string) =>
  `${rolesPath(wsId)}/${encodePathSegment(roleId)}`;
export const roleMembersPath = (wsId: string, roleId: string) =>
  `${rolePath(wsId, roleId)}/members`;
export const inviteMemberPath = (wsId: string) =>
  `/api/workspaces/${encodePathSegment(wsId)}/members/invite`;

/** Enabled permission IDs, sorted, so sets compare and print exactly. */
export function enabledPermissions(role: WorkspaceRoleSummary) {
  return role.permissions
    .filter((entry) => entry.enabled)
    .map((entry) => entry.id)
    .sort();
}

async function failure(response: Response, action: string) {
  const body = (await response.json().catch(() => null)) as {
    message?: unknown;
  } | null;
  const message =
    typeof body?.message === 'string' ? `: ${body.message.slice(0, 160)}` : '';
  return new Error(`${action} failed (HTTP ${response.status})${message}.`);
}

/** Workspace role routes. The server enforces manage_workspace_roles. */
export class WorkspaceRolesAdminClient {
  private readonly api;
  constructor(options: InternalApiClientOptions) {
    this.api = createInternalApiClient(options);
  }

  private async read(path: string, action: string) {
    const response = await this.api.fetch(path, {
      cache: 'no-store',
      redirect: 'error',
    });
    if (!response.ok) throw await failure(response, action);
    return response.json() as Promise<unknown>;
  }

  private async send(
    path: string,
    method: 'POST' | 'DELETE',
    action: string,
    body?: unknown
  ) {
    const response = await this.api.fetch(path, {
      method,
      cache: 'no-store',
      redirect: 'error',
      ...(body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    });
    if (!response.ok) throw await failure(response, action);
    return response.json().catch(() => ({})) as Promise<unknown>;
  }

  /** Roles whose name matches exactly (the server filter is a substring). */
  async findByName(wsId: string, name: string) {
    const query = new URLSearchParams({ q: name, pageSize: '100' });
    const value = await this.read(`${rolesPath(wsId)}?${query}`, 'Role lookup');
    const { data, count } = z
      .object({ data: z.array(roleSchema), count: z.number().optional() })
      .parse(value);
    // A truncated page could hide the exact-name role and cause a duplicate.
    if (count !== undefined && count > data.length)
      throw new Error(
        `${count} roles match "${name}"; too many to check for an exact match.`
      );
    return data.filter((role) => role.name === name);
  }

  async list(wsId: string) {
    const query = new URLSearchParams({ pageSize: '100' });
    const value = await this.read(`${rolesPath(wsId)}?${query}`, 'Role list');
    return z.object({ data: z.array(roleSchema) }).parse(value).data;
  }

  async get(wsId: string, roleId: string) {
    return roleSchema.parse(
      await this.read(rolePath(wsId, roleId), 'Role read')
    );
  }

  async members(wsId: string, roleId: string) {
    const value = await this.read(
      roleMembersPath(wsId, roleId),
      'Role member read'
    );
    return z.object({ data: z.array(memberSchema) }).parse(value).data;
  }

  async create(wsId: string, name: string, permissions: string[]) {
    const value = await this.send(rolesPath(wsId), 'POST', 'Role create', {
      name,
      permissions: permissions.map((id) => ({ id, enabled: true })),
    });
    return z.object({ id: z.uuid() }).parse(value).id;
  }

  async assign(wsId: string, roleId: string, userId: string) {
    await this.send(roleMembersPath(wsId, roleId), 'POST', 'Role assign', {
      memberIds: [userId],
    });
  }

  async unassign(wsId: string, roleId: string, userId: string) {
    await this.send(
      `${roleMembersPath(wsId, roleId)}/${encodePathSegment(userId)}`,
      'DELETE',
      'Role unassign'
    );
  }

  async remove(wsId: string, roleId: string) {
    await this.send(rolePath(wsId, roleId), 'DELETE', 'Role delete');
  }

  async invite(wsId: string, email: string, roleIds: string[]) {
    await this.send(inviteMemberPath(wsId), 'POST', 'Member invite', {
      email,
      roleIds,
    });
  }
}
