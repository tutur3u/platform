import { z } from 'zod';
import type { RouteLimits } from '../contracts';
import { defineRoute } from '../registry';

const readLimits: RouteLimits = {
  bodyBytes: 0,
  deadlineMs: 5000,
  ratePolicy: 'workspace-read',
};

const writeLimits: RouteLimits = {
  bodyBytes: 1_048_576,
  deadlineMs: 10000,
  ratePolicy: 'workspace-write',
};

const empty = z.object({}).strict();

// 1. Roles: options
export const getWorkspaceRoleOptions = defineRoute({
  operationId: 'getWorkspaceRoleOptions',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/roles/options',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_workspace_roles',
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string() }).strict(),
    query: z.object({
      page: z.string().optional(),
      pageSize: z.string().optional(),
    }).passthrough(),
    body: z.null(),
  }),
  output: z.object({
    count: z.number(),
    data: z.array(z.object({ id: z.string(), name: z.string() })),
  }).passthrough(),
  body: 'none',
  status: 200,
  handle: () => ({ count: 0, data: [] }),
});

// 2. Roles: list
export const listWorkspaceRoles = defineRoute({
  operationId: 'listWorkspaceRoles',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/roles',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_workspace_roles',
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string() }).strict(),
    query: z.object({
      page: z.string().optional(),
      pageSize: z.string().optional(),
      q: z.string().optional(),
    }).passthrough(),
    body: z.null(),
  }),
  output: z.object({
    count: z.number(),
    data: z.array(z.record(z.string(), z.unknown())),
  }).passthrough(),
  body: 'none',
  status: 200,
  handle: () => ({ count: 0, data: [] }),
});

// 3. Roles: create
export const createWorkspaceRole = defineRoute({
  operationId: 'createWorkspaceRole',
  method: 'POST',
  path: '/api/v1/workspaces/{wsId}/roles',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_workspace_roles',
  },
  guard: 'web-api',
  limits: writeLimits,
  input: z.object({
    params: z.object({ wsId: z.string() }).strict(),
    query: empty,
    body: z.record(z.string(), z.unknown()),
  }),
  output: z.object({
    id: z.string(),
    message: z.string(),
  }).passthrough(),
  body: 'json',
  status: 200,
  handle: () => ({ id: 'held', message: 'success' }),
});

// 4. Roles: default
export const getWorkspaceDefaultRole = defineRoute({
  operationId: 'getWorkspaceDefaultRole',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/roles/default',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_workspace_roles',
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string() }).strict(),
    query: empty,
    body: z.null(),
  }),
  output: z.record(z.string(), z.unknown()),
  body: 'none',
  status: 200,
  handle: () => ({}),
});

// 5. Roles: detail
export const getWorkspaceRole = defineRoute({
  operationId: 'getWorkspaceRole',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/roles/{roleId}',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_workspace_roles',
    object: { param: 'roleId', resource: 'workspace_roles' },
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string(), roleId: z.string() }).strict(),
    query: empty,
    body: z.null(),
  }),
  output: z.record(z.string(), z.unknown()),
  body: 'none',
  status: 200,
  handle: () => ({}),
});

// 6. Roles: members
export const listWorkspaceRoleMembers = defineRoute({
  operationId: 'listWorkspaceRoleMembers',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/roles/{roleId}/members',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_workspace_roles',
    object: { param: 'roleId', resource: 'workspace_roles' },
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string(), roleId: z.string() }).strict(),
    query: empty,
    body: z.null(),
  }),
  output: z.array(z.record(z.string(), z.unknown())),
  body: 'none',
  status: 200,
  handle: () => [],
});

// 7. Roles: member detail
export const getWorkspaceRoleMember = defineRoute({
  operationId: 'getWorkspaceRoleMember',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/roles/{roleId}/members/{userId}',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_workspace_roles',
    object: { param: 'roleId', resource: 'workspace_roles' },
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string(), roleId: z.string(), userId: z.string() }).strict(),
    query: empty,
    body: z.null(),
  }),
  output: z.record(z.string(), z.unknown()),
  body: 'none',
  status: 200,
  handle: () => ({}),
});

// 8. Roles: wallets
export const listWorkspaceRoleWallets = defineRoute({
  operationId: 'listWorkspaceRoleWallets',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/roles/{roleId}/wallets',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_workspace_roles',
    object: { param: 'roleId', resource: 'workspace_roles' },
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string(), roleId: z.string() }).strict(),
    query: empty,
    body: z.null(),
  }),
  output: z.array(z.record(z.string(), z.unknown())),
  body: 'none',
  status: 200,
  handle: () => [],
});

// 9. Roles: wallet detail
export const getWorkspaceRoleWallet = defineRoute({
  operationId: 'getWorkspaceRoleWallet',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/roles/{roleId}/wallets/{walletId}',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_workspace_roles',
    object: { param: 'roleId', resource: 'workspace_roles' },
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string(), roleId: z.string(), walletId: z.string() }).strict(),
    query: empty,
    body: z.null(),
  }),
  output: z.record(z.string(), z.unknown()),
  body: 'none',
  status: 200,
  handle: () => ({}),
});

// 10. API Keys: list
export const listWorkspaceApiKeys = defineRoute({
  operationId: 'listWorkspaceApiKeys',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/api-keys',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_api_keys',
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string() }).strict(),
    query: z.object({
      page: z.string().optional(),
      pageSize: z.string().optional(),
      q: z.string().optional(),
    }).passthrough(),
    body: z.null(),
  }),
  output: z.union([
    z.array(z.record(z.string(), z.unknown())),
    z.object({
      data: z.array(z.record(z.string(), z.unknown())),
      count: z.number(),
    }),
  ]),
  body: 'none',
  status: 200,
  handle: () => [],
});

// 11. API Keys: create
export const createWorkspaceApiKey = defineRoute({
  operationId: 'createWorkspaceApiKey',
  method: 'POST',
  path: '/api/v1/workspaces/{wsId}/api-keys',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_api_keys',
  },
  guard: 'web-api',
  limits: writeLimits,
  input: z.object({
    params: z.object({ wsId: z.string() }).strict(),
    query: empty,
    body: z.record(z.string(), z.unknown()),
  }),
  output: z.object({
    message: z.string(),
    key: z.string(),
    prefix: z.string(),
  }).passthrough(),
  body: 'json',
  status: 200,
  handle: () => ({ message: 'success', key: 'held', prefix: 'ttr' }),
});

// 12. API Keys: roles
export const getWorkspaceApiKeyRoles = defineRoute({
  operationId: 'getWorkspaceApiKeyRoles',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/api-keys/roles',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_api_keys',
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string() }).strict(),
    query: empty,
    body: z.null(),
  }),
  output: z.array(z.record(z.string(), z.unknown())),
  body: 'none',
  status: 200,
  handle: () => [],
});

// 13. API Keys: detail
export const getWorkspaceApiKey = defineRoute({
  operationId: 'getWorkspaceApiKey',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/api-keys/{keyId}',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_api_keys',
    object: { param: 'keyId', resource: 'workspace_api_keys' },
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string(), keyId: z.string() }).strict(),
    query: empty,
    body: z.null(),
  }),
  output: z.record(z.string(), z.unknown()),
  body: 'none',
  status: 200,
  handle: () => ({}),
});

// 14. API Keys: rotate
export const rotateWorkspaceApiKey = defineRoute({
  operationId: 'rotateWorkspaceApiKey',
  method: 'POST',
  path: '/api/v1/workspaces/{wsId}/api-keys/{keyId}/rotate',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_api_keys',
    object: { param: 'keyId', resource: 'workspace_api_keys' },
  },
  guard: 'web-api',
  limits: writeLimits,
  input: z.object({
    params: z.object({ wsId: z.string(), keyId: z.string() }).strict(),
    query: empty,
    body: empty,
  }),
  output: z.object({
    message: z.string(),
    key: z.string(),
  }).passthrough(),
  body: 'json',
  status: 200,
  handle: () => ({ message: 'success', key: 'held' }),
});

// 15. API Keys: usage-logs
export const listWorkspaceApiKeyUsageLogs = defineRoute({
  operationId: 'listWorkspaceApiKeyUsageLogs',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/api-keys/{keyId}/usage-logs',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_api_keys',
    object: { param: 'keyId', resource: 'workspace_api_keys' },
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string(), keyId: z.string() }).strict(),
    query: empty,
    body: z.null(),
  }),
  output: z.array(z.record(z.string(), z.unknown())),
  body: 'none',
  status: 200,
  handle: () => [],
});

// 16. Whiteboards: create
export const createWorkspaceWhiteboard = defineRoute({
  operationId: 'createWorkspaceWhiteboard',
  method: 'POST',
  path: '/api/v1/workspaces/{wsId}/whiteboards',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_whiteboards',
  },
  guard: 'web-api',
  limits: writeLimits,
  input: z.object({
    params: z.object({ wsId: z.string() }).strict(),
    query: empty,
    body: z.record(z.string(), z.unknown()),
  }),
  output: z.object({
    whiteboard: z.record(z.string(), z.unknown()),
  }).passthrough(),
  body: 'json',
  status: 201,
  handle: () => ({ whiteboard: {} }),
});

// 17. Whiteboards: detail
export const getWorkspaceWhiteboard = defineRoute({
  operationId: 'getWorkspaceWhiteboard',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/whiteboards/{boardId}',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_whiteboards',
    object: { param: 'boardId', resource: 'workspace_whiteboards' },
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string(), boardId: z.string() }).strict(),
    query: empty,
    body: z.null(),
  }),
  output: z.object({
    whiteboard: z.record(z.string(), z.unknown()),
  }).passthrough(),
  body: 'none',
  status: 200,
  handle: () => ({ whiteboard: {} }),
});

// 18. Whiteboards: image-url
export const getWorkspaceWhiteboardImageUrl = defineRoute({
  operationId: 'getWorkspaceWhiteboardImageUrl',
  method: 'POST',
  path: '/api/v1/workspaces/{wsId}/whiteboards/{boardId}/image-url',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_whiteboards',
    object: { param: 'boardId', resource: 'workspace_whiteboards' },
  },
  guard: 'web-api',
  limits: writeLimits,
  input: z.object({
    params: z.object({ wsId: z.string(), boardId: z.string() }).strict(),
    query: empty,
    body: z.record(z.string(), z.unknown()),
  }),
  output: z.record(z.string(), z.unknown()),
  body: 'json',
  status: 200,
  handle: () => ({}),
});

// 19. Workforce: list
export const listWorkspaceWorkforceUsers = defineRoute({
  operationId: 'listWorkspaceWorkforceUsers',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/workforce/users',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_workforce',
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string() }).strict(),
    query: empty,
    body: z.null(),
  }),
  output: z.array(z.record(z.string(), z.unknown())),
  body: 'none',
  status: 200,
  handle: () => [],
});

// 20. Workforce: detail
export const getWorkspaceWorkforceUser = defineRoute({
  operationId: 'getWorkspaceWorkforceUser',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/workforce/users/{userId}',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_workforce',
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string(), userId: z.string() }).strict(),
    query: empty,
    body: z.null(),
  }),
  output: z.record(z.string(), z.unknown()),
  body: 'none',
  status: 200,
  handle: () => ({}),
});

// 21. User profile links: list
export const listWorkspaceUserProfileLinks = defineRoute({
  operationId: 'listWorkspaceUserProfileLinks',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/user-profile-links',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_user_profile_links',
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string() }).strict(),
    query: empty,
    body: z.null(),
  }),
  output: z.array(z.record(z.string(), z.unknown())),
  body: 'none',
  status: 200,
  handle: () => [],
});

// 22. User profile links: users
export const listWorkspaceUserProfileLinkUsers = defineRoute({
  operationId: 'listWorkspaceUserProfileLinkUsers',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/user-profile-links/users',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_user_profile_links',
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string() }).strict(),
    query: empty,
    body: z.null(),
  }),
  output: z.array(z.record(z.string(), z.unknown())),
  body: 'none',
  status: 200,
  handle: () => [],
});

// 23. User profile links: detail
export const getWorkspaceUserProfileLink = defineRoute({
  operationId: 'getWorkspaceUserProfileLink',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/user-profile-links/{linkId}',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_user_profile_links',
    object: { param: 'linkId', resource: 'workspace_user_profile_links' },
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string(), linkId: z.string() }).strict(),
    query: empty,
    body: z.null(),
  }),
  output: z.record(z.string(), z.unknown()),
  body: 'none',
  status: 200,
  handle: () => ({}),
});

// 24. Programming problems: list
export const listWorkspaceProgrammingProblems = defineRoute({
  operationId: 'listWorkspaceProgrammingProblems',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/programming/problems',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_programming_problems',
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string() }).strict(),
    query: empty,
    body: z.null(),
  }),
  output: z.array(z.record(z.string(), z.unknown())),
  body: 'none',
  status: 200,
  handle: () => [],
});

// 25. Programming problems: detail
export const getWorkspaceProgrammingProblem = defineRoute({
  operationId: 'getWorkspaceProgrammingProblem',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/programming/problems/{problemId}',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'manage_programming_problems',
    object: { param: 'problemId', resource: 'workspace_programming_problems' },
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string(), problemId: z.string() }).strict(),
    query: empty,
    body: z.null(),
  }),
  output: z.record(z.string(), z.unknown()),
  body: 'none',
  status: 200,
  handle: () => ({}),
});

// 26. Deleted workspaces check
export const getWorkspaceDeletedStatus = defineRoute({
  operationId: 'getWorkspaceDeletedStatus',
  method: 'GET',
  path: '/api/v1/workspaces/{wsId}/deleted',
  aliases: [],
  policy: {
    kind: 'workspace',
    workspaceParam: 'wsId',
    permission: 'view_workspace',
  },
  guard: 'web-api',
  limits: readLimits,
  input: z.object({
    params: z.object({ wsId: z.string() }).strict(),
    query: empty,
    body: z.null(),
  }),
  output: z.object({
    deleted: z.boolean(),
  }).passthrough(),
  body: 'none',
  status: 200,
  handle: () => ({ deleted: false }),
});

export const workspaceEndpoints = [
  getWorkspaceRoleOptions,
  listWorkspaceRoles,
  createWorkspaceRole,
  getWorkspaceDefaultRole,
  getWorkspaceRole,
  listWorkspaceRoleMembers,
  getWorkspaceRoleMember,
  listWorkspaceRoleWallets,
  getWorkspaceRoleWallet,
  listWorkspaceApiKeys,
  createWorkspaceApiKey,
  getWorkspaceApiKeyRoles,
  getWorkspaceApiKey,
  rotateWorkspaceApiKey,
  listWorkspaceApiKeyUsageLogs,
  createWorkspaceWhiteboard,
  getWorkspaceWhiteboard,
  getWorkspaceWhiteboardImageUrl,
  listWorkspaceWorkforceUsers,
  getWorkspaceWorkforceUser,
  listWorkspaceUserProfileLinks,
  listWorkspaceUserProfileLinkUsers,
  getWorkspaceUserProfileLink,
  listWorkspaceProgrammingProblems,
  getWorkspaceProgrammingProblem,
  getWorkspaceDeletedStatus,
];
