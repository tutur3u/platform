import { z } from 'zod';
import { revalidateMcpActor } from './authorization';
import {
  calendarOutput,
  McpAccessError,
  type McpActor,
  type McpAuthority,
  type McpReads,
  type McpScope,
  navigationOutput,
  taskOutput,
  uuid,
  workspaceOutput,
} from './contracts';

const taskInput = z
  .object({
    workspace_id: uuid,
    limit: z.number().int().min(1).max(50).default(20),
    offset: z.number().int().min(0).max(10000).default(0),
  })
  .strict();
const calendarInput = z
  .object({
    workspace_id: uuid,
    start_at: z.iso.datetime({ offset: true }),
    end_at: z.iso.datetime({ offset: true }),
  })
  .strict();
const navigationInput = z
  .object({ workspace_id: uuid, surface: z.enum(['tasks', 'calendar']) })
  .strict();
const name = (value: string) => value.slice(0, 200);

export class HostedMcpReads {
  constructor(
    private actor: McpActor,
    private authority: McpAuthority,
    private reads: McpReads
  ) {}

  private async permitted(scope: McpScope) {
    return revalidateMcpActor(this.actor, this.authority, scope);
  }

  private async workspace(workspaceId: string, scope: McpScope) {
    const grant = await this.permitted(scope);
    // Hidden affects discovery, not access. An explicitly selected OAuth grant
    // plus current membership/operation permission governs reads and deep links.
    if (!grant.workspaceIds.includes(workspaceId)) {
      throw new McpAccessError(403, 'Workspace is unavailable.');
    }
    // API owns current membership/private-board policy. Guest-only workspace
    // discovery does not authorize unscoped tasks or Calendar access.
    const rows = await this.reads.workspaces();
    if (
      !rows.some(
        (row) => row.id === workspaceId && row.access_type === 'member'
      )
    ) {
      throw new McpAccessError(403, 'Workspace is unavailable.');
    }
  }

  async workspaces() {
    const grant = await this.permitted('mcp:workspaces:read');
    const rows = await this.reads.workspaces();
    const visible = [];
    for (const row of rows) {
      if (
        row.access_type === 'member' &&
        grant.workspaceIds.includes(row.id) &&
        (await this.authority.workspaceVisibility(
          this.actor.userId,
          row.id
        )) === 'visible'
      ) {
        visible.push({ id: row.id, name: name(row.name) });
      }
    }
    const currentGrant = await this.permitted('mcp:workspaces:read');
    const currentMembers = new Set(
      (await this.reads.workspaces())
        .filter((row) => row.access_type === 'member')
        .map((row) => row.id)
    );
    const currentVisible = [];
    for (const row of visible) {
      if (
        currentMembers.has(row.id) &&
        currentGrant.workspaceIds.includes(row.id) &&
        (await this.authority.workspaceVisibility(
          this.actor.userId,
          row.id
        )) === 'visible'
      )
        currentVisible.push(row);
    }
    return workspaceOutput.parse({ workspaces: currentVisible });
  }

  async tasks(input: unknown) {
    const args = taskInput.parse(input);
    await this.workspace(args.workspace_id, 'mcp:tasks:read');
    const rows = await this.reads.tasks(
      args.workspace_id,
      args.limit,
      args.offset
    );
    if (
      rows.length > args.limit ||
      rows.some((row) => row.workspace_id !== args.workspace_id)
    ) {
      throw new McpAccessError(503, 'Unsupported task response.');
    }
    await this.workspace(args.workspace_id, 'mcp:tasks:read');
    return taskOutput.parse({
      ...args,
      tasks: rows.map((row) => ({ id: row.id, name: name(row.name) })),
    });
  }

  async calendar(input: unknown) {
    const args = calendarInput.parse(input);
    const duration = Date.parse(args.end_at) - Date.parse(args.start_at);
    if (duration <= 0 || duration > 7 * 86400000)
      throw new McpAccessError(
        400,
        'Choose a Calendar range of up to seven days.'
      );
    await this.workspace(args.workspace_id, 'mcp:calendar:read');
    const rows = await this.reads.calendar(
      args.workspace_id,
      args.start_at,
      args.end_at
    );
    if (
      rows.length > 100 ||
      rows.some(
        (row) =>
          row.ws_id !== args.workspace_id ||
          !Number.isFinite(Date.parse(row.start_at)) ||
          !Number.isFinite(Date.parse(row.end_at)) ||
          Date.parse(row.end_at) <= Date.parse(row.start_at) ||
          Date.parse(row.start_at) >= Date.parse(args.end_at) ||
          Date.parse(row.end_at) <= Date.parse(args.start_at)
      )
    ) {
      throw new McpAccessError(
        503,
        'Calendar response exceeds the permitted scope.'
      );
    }
    await this.workspace(args.workspace_id, 'mcp:calendar:read');
    return calendarOutput.parse({
      workspace_id: args.workspace_id,
      events: rows.map((row) => ({
        id: row.id,
        title: name(row.title),
        start_at: row.start_at,
        end_at: row.end_at,
      })),
    });
  }

  async navigation(input: unknown) {
    const args = navigationInput.parse(input);
    await this.workspace(
      args.workspace_id,
      args.surface === 'tasks' ? 'mcp:tasks:read' : 'mcp:calendar:read'
    );
    return navigationOutput.parse({
      ...args,
      url: `https://${args.surface}.tuturuuu.com/${args.workspace_id}${args.surface === 'tasks' ? '/tasks' : ''}`,
    });
  }
}
