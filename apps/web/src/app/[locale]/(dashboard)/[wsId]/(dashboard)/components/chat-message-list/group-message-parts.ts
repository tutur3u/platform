import type { UIMessage } from '@tuturuuu/ai/types';
import { getToolName, isToolUIPart } from 'ai';
import type { RenderGroup, ToolPartData } from './types';

/**
 * Starting from `startIdx`, find the index of the next tool-UI part,
 * skipping over non-tool parts like `step-start`.
 * Returns -1 if none is found.
 */
function findNextToolIndex(
  parts: UIMessage['parts'],
  startIdx: number
): number {
  for (let j = startIdx; j < parts.length; j++) {
    if (isToolUIPart(parts[j]!)) return j;
    // Stop scanning if we hit a text or reasoning part — those are
    // meaningful content boundaries that should not be bridged.
    const type = (parts[j] as { type?: string }).type;
    if (type === 'text' || type === 'reasoning') return -1;
  }
  return -1;
}

export function groupMessageParts(parts: UIMessage['parts']): RenderGroup[] {
  if (!parts) return [];

  const groups: RenderGroup[] = [];
  let currentToolGroup: {
    toolName: string;
    parts: ToolPartData[];
    startIndex: number;
  } | null = null;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;

    if (isToolUIPart(part)) {
      const name = getToolName(part as never);
      if (name === 'no_action_needed') continue;
      if (currentToolGroup && currentToolGroup.toolName === name) {
        currentToolGroup.parts.push(part as ToolPartData);
      } else {
        if (currentToolGroup) {
          groups.push({ kind: 'tool', ...currentToolGroup });
        }
        currentToolGroup = {
          toolName: name,
          parts: [part as ToolPartData],
          startIndex: i,
        };
      }
    } else {
      if (currentToolGroup) {
        // When the current group is render_ui, don't flush on step-start
        // boundaries — the model may retry render_ui across steps, and we
        // want to consolidate all attempts into a single group so the UI
        // can show a single failure indicator with an attempt count.
        if (
          currentToolGroup.toolName === 'render_ui' &&
          part.type === 'step-start'
        ) {
          const nextToolIdx = findNextToolIndex(parts, i + 1);
          if (nextToolIdx !== -1) {
            const nextPart = parts[nextToolIdx]!;
            const nextName = getToolName(nextPart as never);
            if (nextName === 'render_ui') {
              // Skip this step-start; keep the render_ui group open.
              continue;
            }
          }
        }

        groups.push({ kind: 'tool', ...currentToolGroup });
        currentToolGroup = null;
      }
      if (part.type === 'text' || part.type === 'reasoning') {
        if (
          typeof (part as { text?: unknown }).text === 'string' &&
          (part as { text: string }).text.trim().length > 0
        ) {
          groups.push({
            kind: part.type,
            text: (part as { text: string }).text,
            index: i,
          });
        }
        continue;
      }

      groups.push({ kind: 'other', index: i });
    }
  }

  if (currentToolGroup) {
    groups.push({ kind: 'tool', ...currentToolGroup });
  }

  return groups;
}
