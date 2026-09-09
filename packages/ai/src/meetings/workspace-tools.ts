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

// These existing platform operations require membership rather than a separate
// permission. Session/goal executors scope records to ctx.userId; categories
// follow the platform's workspace-member policy. New unannotated tools fail closed.
const memberTools = new Set([
  'get_my_tasks',
  'list_boards',
  'list_task_lists',
  'list_task_labels',
  'list_projects',
  'start_timer',
  'stop_timer',
  'list_time_tracking_sessions',
  'get_time_tracking_session',
  'get_time_tracker_stats',
  'get_time_tracker_goals',
  'create_time_tracker_goal',
  'update_time_tracker_goal',
  'delete_time_tracker_goal',
  'create_time_tracking_entry',
  'update_time_tracking_session',
  'delete_time_tracking_session',
  'move_time_tracking_session',
  'list_time_tracking_categories',
  'create_time_tracking_category',
  'update_time_tracking_category',
  'delete_time_tracking_category',
]);

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
    if (!required && !memberTools.has(name)) continue;
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
