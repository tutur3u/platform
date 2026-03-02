import {
  executeCheckE2EEStatus,
  executeCreateEvent,
  executeDeleteEvent,
  executeEnableE2EE,
  executeGetUpcomingEvents,
  executeUpdateEvent,
} from './executors/calendar';
import { executeSetImmersiveMode } from './executors/chat';
import {
  executeCreateTransactionCategory,
  executeCreateTransactionTag,
  executeCreateWallet,
  executeDeleteTransaction,
  executeDeleteTransactionCategory,
  executeDeleteTransactionTag,
  executeDeleteWallet,
  executeGetSpendingSummary,
  executeGetTransaction,
  executeListTransactionCategories,
  executeListTransactions,
  executeListTransactionTags,
  executeListWallets,
  executeLogTransaction,
  executeSetDefaultCurrency,
  executeUpdateTransaction,
  executeUpdateTransactionCategory,
  executeUpdateTransactionTag,
  executeUpdateWallet,
} from './executors/finance';
import { executeGenerateImage } from './executors/image';
import { executeConvertFileToMarkdown } from './executors/markitdown';
import {
  executeDeleteMemory,
  executeListMemories,
  executeMergeMemories,
  executeRecall,
  executeRemember,
} from './executors/memory';
import { executeGoogleSearch } from './executors/search';
import { executeUpdateMySettings } from './executors/settings';
import {
  executeAddTaskAssignee,
  executeAddTaskLabels,
  executeAddTaskToProject,
  executeCompleteTask,
  executeCreateBoard,
  executeCreateProject,
  executeCreateTask,
  executeCreateTaskLabel,
  executeCreateTaskList,
  executeDeleteBoard,
  executeDeleteProject,
  executeDeleteTask,
  executeDeleteTaskLabel,
  executeDeleteTaskList,
  executeGetMyTasks,
  executeListBoards,
  executeListProjects,
  executeListTaskLabels,
  executeListTaskLists,
  executeRemoveTaskAssignee,
  executeRemoveTaskFromProject,
  executeRemoveTaskLabels,
  executeUpdateBoard,
  executeUpdateProject,
  executeUpdateTask,
  executeUpdateTaskLabel,
  executeUpdateTaskList,
} from './executors/tasks';
import { executeSetTheme } from './executors/theme';
import {
  executeCreateTimeTrackingEntry,
  executeDeleteTimeTrackingSession,
  executeGetTimeTrackingSession,
  executeListTimeTrackingSessions,
  executeMoveTimeTrackingSession,
  executeStartTimer,
  executeStopTimer,
  executeUpdateTimeTrackingSession,
} from './executors/timer';
import { executeUpdateUserName } from './executors/user';
import {
  executeGetWorkspaceContext,
  executeListAccessibleWorkspaces,
  executeListWorkspaceMembers,
  executeSetWorkspaceContext,
} from './executors/workspace';
import type { DefinedMiraToolName } from './mira-tool-definitions';
import {
  buildRenderUiRecoverySpec,
  isRenderableRenderUiSpec,
} from './mira-tool-render-ui';
import type { MiraToolContext } from './mira-tool-types';

type ToolHandler = (
  args: Record<string, unknown>,
  ctx: MiraToolContext
) => Promise<unknown> | unknown;

const toolHandlers = {
  select_tools: (args) => ({ ok: true, selectedTools: args.tools }),
  no_action_needed: () => ({ ok: true }),
  google_search: executeGoogleSearch,

  get_my_tasks: executeGetMyTasks,
  create_task: executeCreateTask,
  complete_task: executeCompleteTask,
  update_task: executeUpdateTask,
  delete_task: executeDeleteTask,
  list_boards: executeListBoards,
  create_board: executeCreateBoard,
  update_board: executeUpdateBoard,
  delete_board: executeDeleteBoard,
  list_task_lists: executeListTaskLists,
  create_task_list: executeCreateTaskList,
  update_task_list: executeUpdateTaskList,
  delete_task_list: executeDeleteTaskList,
  list_task_labels: executeListTaskLabels,
  create_task_label: executeCreateTaskLabel,
  update_task_label: executeUpdateTaskLabel,
  delete_task_label: executeDeleteTaskLabel,
  add_task_labels: executeAddTaskLabels,
  remove_task_labels: executeRemoveTaskLabels,
  list_projects: executeListProjects,
  create_project: executeCreateProject,
  update_project: executeUpdateProject,
  delete_project: executeDeleteProject,
  add_task_to_project: executeAddTaskToProject,
  remove_task_from_project: executeRemoveTaskFromProject,
  add_task_assignee: executeAddTaskAssignee,
  remove_task_assignee: executeRemoveTaskAssignee,

  get_upcoming_events: executeGetUpcomingEvents,
  create_event: executeCreateEvent,
  update_event: executeUpdateEvent,
  delete_event: executeDeleteEvent,
  check_e2ee_status: executeCheckE2EEStatus,
  enable_e2ee: executeEnableE2EE,

  log_transaction: executeLogTransaction,
  get_spending_summary: executeGetSpendingSummary,
  list_wallets: executeListWallets,
  create_wallet: executeCreateWallet,
  update_wallet: executeUpdateWallet,
  delete_wallet: executeDeleteWallet,
  list_transactions: executeListTransactions,
  get_transaction: executeGetTransaction,
  update_transaction: executeUpdateTransaction,
  delete_transaction: executeDeleteTransaction,
  list_transaction_categories: executeListTransactionCategories,
  create_transaction_category: executeCreateTransactionCategory,
  update_transaction_category: executeUpdateTransactionCategory,
  delete_transaction_category: executeDeleteTransactionCategory,
  list_transaction_tags: executeListTransactionTags,
  create_transaction_tag: executeCreateTransactionTag,
  update_transaction_tag: executeUpdateTransactionTag,
  delete_transaction_tag: executeDeleteTransactionTag,

  start_timer: executeStartTimer,
  stop_timer: executeStopTimer,
  list_time_tracking_sessions: executeListTimeTrackingSessions,
  get_time_tracking_session: executeGetTimeTrackingSession,
  create_time_tracking_entry: executeCreateTimeTrackingEntry,
  update_time_tracking_session: executeUpdateTimeTrackingSession,
  delete_time_tracking_session: executeDeleteTimeTrackingSession,
  move_time_tracking_session: executeMoveTimeTrackingSession,

  remember: executeRemember,
  recall: executeRecall,
  list_memories: executeListMemories,
  delete_memory: executeDeleteMemory,
  merge_memories: executeMergeMemories,

  create_image: executeGenerateImage,
  convert_file_to_markdown: executeConvertFileToMarkdown,
  list_accessible_workspaces: executeListAccessibleWorkspaces,
  get_workspace_context: executeGetWorkspaceContext,
  set_workspace_context: executeSetWorkspaceContext,

  update_my_settings: executeUpdateMySettings,
  set_default_currency: executeSetDefaultCurrency,
  set_theme: executeSetTheme,
  list_workspace_members: executeListWorkspaceMembers,
  update_user_name: executeUpdateUserName,
  set_immersive_mode: executeSetImmersiveMode,
} satisfies Record<Exclude<DefinedMiraToolName, 'render_ui'>, ToolHandler>;

export async function executeMiraTool(
  toolName: string,
  args: Record<string, unknown>,
  ctx: MiraToolContext
): Promise<unknown> {
  if (toolName === 'render_ui') {
    if (!isRenderableRenderUiSpec(args)) {
      const diagnosisParts: string[] = [];
      if (typeof args.root !== 'string' || args.root.length === 0) {
        diagnosisParts.push('`root` is missing or not a string');
      }
      const elements = args.elements;
      if (
        !elements ||
        typeof elements !== 'object' ||
        Array.isArray(elements)
      ) {
        diagnosisParts.push('`elements` is missing or not an object');
      } else if (Object.keys(elements as object).length === 0) {
        diagnosisParts.push(
          '`elements` is empty — you must define at least elements[root]'
        );
      } else if (
        typeof args.root === 'string' &&
        args.root.length > 0 &&
        !(args.root in (elements as Record<string, unknown>))
      ) {
        diagnosisParts.push(
          `elements["${args.root}"] does not exist — the root element ID must be a key in elements`
        );
      }
      const diagnosis =
        diagnosisParts.length > 0
          ? ` Diagnosis: ${diagnosisParts.join('; ')}.`
          : '';

      return {
        spec: buildRenderUiRecoverySpec(args),
        recoveredFromInvalidSpec: true,
        warning: `Invalid render_ui spec was auto-recovered.${diagnosis} Fix: elements MUST contain the root element. Example: { "root": "r", "elements": { "r": { "type": "Card", "props": { "title": "Result" }, "children": ["t"] }, "t": { "type": "Text", "props": { "content": "Your content here" }, "children": [] } } }.`,
      };
    }
    return { spec: args };
  }

  if (!(toolName in toolHandlers))
    return { error: `Unknown tool: ${toolName}` };

  const handler = toolHandlers[toolName as keyof typeof toolHandlers];

  return handler(args, ctx);
}
