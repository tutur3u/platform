import { buildMiraContext } from '../tools/context-builder';
import type { MiraWorkspaceContextState } from '../tools/workspace-context';
import { buildMiraSystemInstruction } from './mira-system-instruction';

/** The shared identity, memory, workspace and behavior prompt for Chat and Live. */
export async function buildMiraPrompt({
  workspaceContext,
  taskBoardInstruction,
  ...options
}: Parameters<typeof buildMiraContext>[0] & {
  workspaceContext: MiraWorkspaceContextState;
  taskBoardInstruction?: string | null;
}): Promise<string> {
  const { contextString, soul, isFirstInteraction } =
    await buildMiraContext(options);
  const workspaceInstruction = `## Workspace Context\n\nCurrent task/calendar/finance workspace context: ${workspaceContext.name} (${workspaceContext.personal ? 'personal' : 'shared'} workspace).\nUse this workspace for "my tasks", "my calendar", and "my finance" requests. Only switch to another workspace when the user explicitly names a different workspace.`;
  return [
    contextString,
    workspaceInstruction,
    taskBoardInstruction,
    buildMiraSystemInstruction({
      soul,
      isFirstInteraction,
      withoutPermission: options.withoutPermission,
    }),
  ]
    .filter(Boolean)
    .join('\n\n');
}
