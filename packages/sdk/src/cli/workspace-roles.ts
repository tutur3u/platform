import {
  enabledPermissions,
  inviteMemberPath,
  roleMembersPath,
  rolePath,
  rolesPath,
  type WorkspaceRolesAdminClient,
  type WorkspaceRoleSummary,
} from '../platform-workspace-roles';
import { type FlagValue, getFlag, isDryRun } from './args';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const PERMISSION = /^[a-z][a-z0-9_]{1,63}$/u;

export interface WorkspaceRolesCliOptions {
  client: () => WorkspaceRolesAdminClient;
  flags: Record<string, FlagValue>;
  json: boolean;
  /** Positionals after `workspaces`: ['roles'|'members', action]. */
  positionals: string[];
  write?: (text: string) => void;
}

type Context = Required<Omit<WorkspaceRolesCliOptions, 'positionals'>> & {
  action: string | undefined;
  dryRun: boolean;
};

function emit(ctx: Context, value: unknown, human: string[]) {
  ctx.write(
    ctx.json ? `${JSON.stringify(value, null, 2)}\n` : `${human.join('\n')}\n`
  );
}

function uuidFlag(ctx: Context, name: string, label = name) {
  const value = getFlag(ctx.flags, name)?.toLowerCase();
  if (!value || !UUID.test(value))
    throw new Error(`Pass --${name} <${label} UUID>.`);
  return value;
}

/** Destructive and grant commands require the exact target UUID twice. */
function confirmed(ctx: Context, target: string) {
  if (getFlag(ctx.flags, 'confirm')?.toLowerCase() !== target)
    throw new Error(`Type the exact target UUID in --confirm ${target}.`);
}

function roleView(role: WorkspaceRoleSummary) {
  return {
    id: role.id,
    name: role.name,
    permissions: enabledPermissions(role),
  };
}

function plan(
  ctx: Context,
  method: string,
  path: string,
  body: unknown,
  extra: Record<string, unknown> = {}
) {
  emit(ctx, { dryRun: true, request: { method, path, body }, ...extra }, [
    `Dry run: would ${method} ${path}`,
    ...(body === undefined ? [] : [`  body ${JSON.stringify(body)}`]),
    ...Object.entries(extra).map(
      ([key, value]) => `  ${key}: ${JSON.stringify(value)}`
    ),
    'Nothing was sent.',
  ]);
}

function parsePermissions(ctx: Context) {
  const raw =
    getFlag(ctx.flags, 'permission') ?? getFlag(ctx.flags, 'permissions');
  if (!raw)
    throw new Error(
      'Pass the full permission list explicitly with --permission <id[,id...]>; there is no default set.'
    );
  const ids = [...new Set(raw.split(',').map((id) => id.trim()))].sort();
  if (!ids.length || ids.some((id) => !PERMISSION.test(id)))
    throw new Error(
      'Permission IDs are lowercase snake_case, comma separated.'
    );
  return ids;
}

async function createRole(ctx: Context, wsId: string) {
  const name = getFlag(ctx.flags, 'name')?.trim();
  if (!name || name.length > 100) throw new Error('Pass --name <role name>.');
  const permissions = parsePermissions(ctx);
  const client = ctx.client();
  const matches = await client.findByName(wsId, name);
  if (matches.length > 1)
    throw new Error(
      `${matches.length} roles are named "${name}"; resolve them first.`
    );
  const found = matches[0];
  if (found) {
    const actual = enabledPermissions(found);
    const same = actual.join(',') === permissions.join(',');
    emit(
      ctx,
      {
        status: same ? 'exists' : 'mismatch',
        role: roleView(found),
        requested: permissions,
      },
      [
        `Role "${name}" already exists: ${found.id}`,
        `Permissions: ${actual.join(', ') || '(none)'}`,
        ...(same
          ? ['Nothing changed.']
          : [`Requested ${permissions.join(', ')}; not modified.`]),
      ]
    );
    if (!same) process.exitCode = 1;
    return;
  }
  if (ctx.dryRun)
    return plan(ctx, 'POST', rolesPath(wsId), {
      name,
      permissions: permissions.map((id) => ({ id, enabled: true })),
    });
  const id = await client.create(wsId, name, permissions);
  const role = await client.get(wsId, id);
  const actual = enabledPermissions(role);
  const same = actual.join(',') === permissions.join(',');
  emit(
    ctx,
    {
      status: same ? 'created' : 'created_with_different_permissions',
      role: roleView(role),
      requested: permissions,
    },
    [
      `Created role "${role.name}": ${role.id}`,
      `Resulting permissions: ${actual.join(', ') || '(none)'}`,
      ...(same
        ? []
        : [
            `WARNING: requested ${permissions.join(', ')}; the server stored a different set.`,
          ]),
    ]
  );
  if (!same) process.exitCode = 1;
}

async function showRole(ctx: Context, wsId: string) {
  const roleId = uuidFlag(ctx, 'role', 'role');
  const client = ctx.client();
  const role = await client.get(wsId, roleId);
  const members = await client.members(wsId, roleId);
  emit(ctx, { role: roleView(role), members }, [
    `${role.id}  ${role.name}`,
    `Permissions: ${enabledPermissions(role).join(', ') || '(none)'}`,
    `Members: ${members.map((m) => `${m.id}${m.email ? ` <${m.email}>` : ''}`).join(', ') || '(none)'}`,
  ]);
}

async function listRoles(ctx: Context, wsId: string) {
  const roles = await ctx.client().list(wsId);
  emit(
    ctx,
    { roles: roles.map(roleView) },
    roles.length
      ? roles.map(
          (r) => `${r.id}  ${r.name}  [${enabledPermissions(r).join(', ')}]`
        )
      : ['No roles.']
  );
}

async function memberChange(ctx: Context, wsId: string, assign: boolean) {
  const roleId = uuidFlag(ctx, 'role', 'role');
  const userId = uuidFlag(ctx, 'user', 'user');
  confirmed(ctx, userId);
  const client = ctx.client();
  const role = await client.get(wsId, roleId);
  const members = await client.members(wsId, roleId);
  const isMember = members.some((member) => member.id === userId);
  const view = { role: roleView(role), userId, currentlyAssigned: isMember };
  if (isMember === assign) {
    emit(
      ctx,
      { status: assign ? 'already_assigned' : 'not_assigned', ...view },
      [
        `${userId} is ${assign ? 'already' : 'not'} assigned to "${role.name}"; nothing changed.`,
      ]
    );
    return;
  }
  const path = assign
    ? roleMembersPath(wsId, roleId)
    : `${roleMembersPath(wsId, roleId)}/${userId}`;
  if (ctx.dryRun)
    return plan(
      ctx,
      assign ? 'POST' : 'DELETE',
      path,
      assign ? { memberIds: [userId] } : undefined,
      view
    );
  if (assign) await client.assign(wsId, roleId, userId);
  else await client.unassign(wsId, roleId, userId);
  emit(
    ctx,
    {
      status: assign ? 'assigned' : 'unassigned',
      ...view,
      currentlyAssigned: assign,
    },
    [
      `${assign ? 'Assigned' : 'Unassigned'} ${userId} ${assign ? 'to' : 'from'} "${role.name}" [${enabledPermissions(role).join(', ')}].`,
    ]
  );
}

async function deleteRole(ctx: Context, wsId: string) {
  const roleId = uuidFlag(ctx, 'role', 'role');
  confirmed(ctx, roleId);
  const client = ctx.client();
  const role = await client.get(wsId, roleId);
  const members = await client.members(wsId, roleId);
  const view = { role: roleView(role), memberCount: members.length };
  if (ctx.dryRun)
    return plan(ctx, 'DELETE', rolePath(wsId, roleId), undefined, view);
  await client.remove(wsId, roleId);
  emit(ctx, { status: 'deleted', ...view }, [
    `Deleted role "${role.name}" (${roleId}); ${members.length} member(s) lost it.`,
  ]);
}

async function invite(ctx: Context, wsId: string) {
  const email = getFlag(ctx.flags, 'email')?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
    throw new Error('Pass --email <address>.');
  const roleId = getFlag(ctx.flags, 'role')?.toLowerCase();
  if (roleId !== undefined && !UUID.test(roleId))
    throw new Error('--role must be a role UUID.');
  // The invitation grants the role on acceptance, so it is confirmed like assign.
  if (roleId) confirmed(ctx, roleId);
  const roleIds = roleId ? [roleId] : [];
  const role = roleId ? roleView(await ctx.client().get(wsId, roleId)) : null;
  if (ctx.dryRun)
    return plan(
      ctx,
      'POST',
      inviteMemberPath(wsId),
      { email, roleIds },
      { role }
    );
  await ctx.client().invite(wsId, email, roleIds);
  emit(ctx, { status: 'invited', email, workspaceId: wsId, role }, [
    `Invited ${email} to ${wsId}${role ? ` with "${role.name}" [${role.permissions.join(', ')}]` : ''}.`,
    'The invitee accepts after signing in; the role applies on acceptance.',
  ]);
}

/** `ttr workspaces roles <...>` and `ttr workspaces members invite`. */
export async function runWorkspaceRolesCommand(
  options: WorkspaceRolesCliOptions
) {
  const [resource, action] = options.positionals;
  const ctx: Context = {
    client: options.client,
    flags: options.flags,
    json: options.json,
    write: options.write ?? ((text) => process.stdout.write(text)),
    action,
    dryRun: isDryRun(options.flags),
  };
  if (!action) return ctx.write(workspaceRolesHelp());
  const wsId = uuidFlag(ctx, 'workspace', 'workspace');
  if (resource === 'members') {
    if (action === 'invite') return invite(ctx, wsId);
    throw new Error(
      'Unknown workspaces members command. See `ttr workspaces roles --help`.'
    );
  }
  switch (action) {
    case 'list':
      return listRoles(ctx, wsId);
    case 'show':
      return showRole(ctx, wsId);
    case 'create':
      return createRole(ctx, wsId);
    case 'assign':
      return memberChange(ctx, wsId, true);
    case 'unassign':
      return memberChange(ctx, wsId, false);
    case 'delete':
      return deleteRole(ctx, wsId);
    default:
      throw new Error(
        'Unknown workspaces roles command. See `ttr workspaces roles --help`.'
      );
  }
}

export function workspaceRolesHelp() {
  return `Workspace roles (permission manage_workspace_roles in that workspace)

  ttr workspaces roles list --workspace <uuid> [--json]
  ttr workspaces roles show --workspace <uuid> --role <uuid> [--json]
  ttr workspaces roles create --workspace <uuid> --name <name>
      --permission <id[,id...]> [--dry-run] [--json]
  ttr workspaces roles assign --workspace <uuid> --role <uuid> --user <uuid>
      --confirm <user uuid> [--dry-run] [--json]
  ttr workspaces roles unassign --workspace <uuid> --role <uuid> --user <uuid>
      --confirm <user uuid> [--dry-run] [--json]
  ttr workspaces roles delete --workspace <uuid> --role <uuid>
      --confirm <role uuid> [--dry-run] [--json]
  ttr workspaces members invite --workspace <uuid> --email <address>
      [--role <uuid> --confirm <role uuid>] [--dry-run] [--json]
      (needs manage_workspace_members)

create takes the complete permission list; there is no default set. It prints
the exact permission set the server stored, and an existing role with the same
name is reported, never modified. assign needs a full workspace member; invite
first if the user is not one. --dry-run only makes read-only GETs; list and
show are read-only already.
The root workspace is 00000000-0000-0000-0000-000000000000.
`;
}
