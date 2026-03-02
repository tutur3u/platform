import { calendarToolDefinitions } from './definitions/calendar';
import { financeToolDefinitions } from './definitions/finance';
import { imageToolDefinitions } from './definitions/image';
import { memoryToolDefinitions } from './definitions/memory';
import { metaToolDefinitions } from './definitions/meta';
import { renderUiToolDefinitions } from './definitions/render-ui';
import { taskToolDefinitions } from './definitions/tasks';
import { timeTrackingToolDefinitions } from './definitions/time-tracking';
import { workspaceContextToolDefinitions } from './definitions/workspace-context';
import { workspaceUserChatToolDefinitions } from './definitions/workspace-user-chat';
import type { DefinedMiraToolName, MiraToolName } from './mira-tool-names';

type MiraToolDefinitions = typeof metaToolDefinitions &
  typeof taskToolDefinitions &
  typeof calendarToolDefinitions &
  typeof financeToolDefinitions &
  typeof timeTrackingToolDefinitions &
  typeof memoryToolDefinitions &
  typeof imageToolDefinitions &
  typeof workspaceContextToolDefinitions &
  typeof workspaceUserChatToolDefinitions &
  typeof renderUiToolDefinitions;

function mergeUniqueToolDefinitions(
  ...sources: ReadonlyArray<Record<string, unknown>>
): MiraToolDefinitions {
  const merged: Record<string, unknown> = {};

  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (key in merged) {
        throw new Error(`Duplicate Mira tool definition key: ${key}`);
      }

      merged[key] = value;
    }
  }

  return merged as MiraToolDefinitions;
}

export const miraToolDefinitions = mergeUniqueToolDefinitions(
  metaToolDefinitions,
  taskToolDefinitions,
  calendarToolDefinitions,
  financeToolDefinitions,
  timeTrackingToolDefinitions,
  memoryToolDefinitions,
  imageToolDefinitions,
  workspaceContextToolDefinitions,
  workspaceUserChatToolDefinitions,
  renderUiToolDefinitions
);

export type { DefinedMiraToolName, MiraToolName };
