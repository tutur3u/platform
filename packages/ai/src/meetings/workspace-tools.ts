import type { PermissionId } from '@tuturuuu/types';
import type { ToolSet } from 'ai';
import { calendarToolDefinitions } from '../tools/definitions/calendar';
import { financeToolDefinitions } from '../tools/definitions/finance';
import { taskToolDefinitions } from '../tools/definitions/tasks';
import { timeTrackingToolDefinitions } from '../tools/definitions/time-tracking';
import { MIRA_TOOL_PERMISSIONS } from '../tools/mira-tool-metadata';
import type { MiraToolName } from '../tools/mira-tool-names';
import type { MiraToolContext } from '../tools/mira-tool-types';
import { executeMeetWorkspaceTool } from './workspace-tool-handlers';

/** Same platform definitions and executors; all access is reviewed privately. */
export function createMeetWorkspaceTools(
  ctx: MiraToolContext,
  withoutPermission: (permission: PermissionId) => boolean
): ToolSet {
  const tools: ToolSet = {};
  const definitions = {
    ...taskToolDefinitions,
    ...calendarToolDefinitions,
    ...financeToolDefinitions,
    ...timeTrackingToolDefinitions,
  };
  for (const [name, definition] of Object.entries(definitions)) {
    // E2EE activation needs the platform's client key-management flow.
    if (name === 'enable_e2ee') continue;
    const required = MIRA_TOOL_PERMISSIONS[name as MiraToolName];
    const permissions = required
      ? Array.isArray(required)
        ? required
        : [required]
      : [];
    if (permissions.some(withoutPermission)) continue;
    tools[name] = {
      ...definition,
      execute: (args: Record<string, unknown>) =>
        executeMeetWorkspaceTool(name, args, ctx),
    } as ToolSet[string];
  }
  return tools;
}
