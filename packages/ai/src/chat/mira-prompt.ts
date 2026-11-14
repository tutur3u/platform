import {
  buildMiraContext,
  type MiraContextStageTiming,
} from '../tools/context-builder';
import type { MiraWorkspaceContextState } from '../tools/workspace-context';
import { buildMiraSystemInstruction } from './mira-system-instruction';

type MiraPromptOptions = Parameters<typeof buildMiraContext>[0] & {
  workspaceContext: MiraWorkspaceContextState;
  taskBoardInstruction?: string | null;
};

/**
 * The shared identity, memory, workspace and behavior prompt for Chat and
 * Live, with the context builder's stage timings for Server-Timing.
 */
export async function buildMiraPromptWithTimings({
  workspaceContext,
  taskBoardInstruction,
  ...options
}: MiraPromptOptions): Promise<{
  prompt: string;
  timings: MiraContextStageTiming[];
}> {
  const { contextString, soul, isFirstInteraction, timings } =
    await buildMiraContext(options);
  const workspaceInstruction = `## Workspace Context\n\nCurrent task/calendar/finance workspace context: ${workspaceContext.name} (${workspaceContext.personal ? 'personal' : 'shared'} workspace).\nUse this workspace for "my tasks", "my calendar", and "my finance" requests. Only switch to another workspace when the user explicitly names a different workspace.`;
  const prompt = [
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
  return { prompt, timings: timings ?? [] };
}

/** The shared identity, memory, workspace and behavior prompt for Chat and Live. */
export async function buildMiraPrompt(
  options: MiraPromptOptions
): Promise<string> {
  return (await buildMiraPromptWithTimings(options)).prompt;
}
