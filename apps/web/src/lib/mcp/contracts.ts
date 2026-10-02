import { z } from 'zod';

export const uuid = z.uuid();
export const MCP_SCOPES = [
  'mcp:workspaces:read',
  'mcp:tasks:read',
  'mcp:calendar:read',
] as const;
export const scope = z.enum(MCP_SCOPES);
export type McpScope = z.infer<typeof scope>;
export type WorkspaceVisibility = 'visible' | 'hidden' | 'unknown';

export const grantSchema = z
  .object({
    id: uuid,
    userId: uuid,
    clientId: z.string().min(1).max(512),
    resource: z.url(),
    revision: z.number().int().positive(),
    workspaceIds: z.array(uuid).min(1).max(20),
    scopes: z.array(scope).min(1).max(3),
    expiresAt: z.number().int().positive(),
    revoked: z.boolean(),
  })
  .strict();
export type McpGrant = z.infer<typeof grantSchema>;

// Credentials are internal request state only. Never serialize this into results.
export type McpActor = {
  userId: string;
  clientId: string;
  sessionId: string;
  tokenExpiresAt: number;
  grant: McpGrant;
  providerAccessToken: string;
};
export type McpConfig = {
  resource: string;
  metadataUrl: string;
  issuer: string;
  jwksUrl: string;
  allowedClientIds: ReadonlySet<string>;
  allowedOrigins: ReadonlySet<string>;
  // Explicit release gate: no default true and no automatic environment enable.
  securityReviewComplete: boolean;
};

export class McpAccessError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 413 | 429 | 503,
    message: string
  ) {
    super(message);
  }
}

export interface McpAuthority {
  // Fresh authoritative checks, not caches. Lookup errors must reject the request.
  readGrant(
    userId: string,
    clientId: string,
    grantId: string
  ): Promise<McpGrant | null>;
  revalidateProviderSession(
    token: string,
    sessionId: string
  ): Promise<{
    userId: string;
    clientIds: string[];
    sessionActive: boolean;
    accountAllowed: boolean;
    mfaAllowed: boolean;
  }>;
  workspaceVisibility(
    userId: string,
    workspaceId: string
  ): Promise<WorkspaceVisibility>;
  admit(userId: string, clientId: string): Promise<boolean>;
}

export type WorkspaceSummary = {
  id: string;
  name: string;
  access_type: string;
};
export type TaskSummary = { id: string; name: string; workspace_id: string };
export type CalendarSummary = {
  id: string;
  title: string;
  ws_id: string;
  start_at: string;
  end_at: string;
};
export interface McpReads {
  workspaces(): Promise<WorkspaceSummary[]>;
  tasks(
    workspaceId: string,
    limit: number,
    offset: number
  ): Promise<TaskSummary[]>;
  calendar(
    workspaceId: string,
    start: string,
    end: string
  ): Promise<CalendarSummary[]>;
}

export const workspaceOutput = z.object({
  workspaces: z.array(z.object({ id: uuid, name: z.string().max(200) })),
});
export const taskOutput = z.object({
  workspace_id: uuid,
  tasks: z.array(z.object({ id: uuid, name: z.string().max(200) })).max(50),
  limit: z.number().int(),
  offset: z.number().int(),
});
export const calendarOutput = z.object({
  workspace_id: uuid,
  events: z
    .array(
      z.object({
        id: uuid,
        title: z.string().max(200),
        start_at: z.iso.datetime({ offset: true }),
        end_at: z.iso.datetime({ offset: true }),
      })
    )
    .max(100),
});
export const navigationOutput = z.object({
  workspace_id: uuid,
  surface: z.enum(['tasks', 'calendar']),
  url: z.url(),
});
