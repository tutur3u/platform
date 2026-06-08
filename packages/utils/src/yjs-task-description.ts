import type { JSONContent } from '@tiptap/core';
import {
  hasMeaningfulTaskDescriptionContent,
  isValidTaskDescriptionContent,
  parseTaskDescriptionContent,
  taskDescriptionSchema,
} from './task-description-content';
import { getDescriptionText } from './text-helper';
import {
  convertJsonContentToYjsState,
  convertYjsStateToJsonContent,
} from './yjs-helper';

export { isValidTaskDescriptionContent, taskDescriptionSchema };

export function isValidTaskDescriptionYjsState(
  yjsState: number[] | null | undefined
): boolean {
  if (yjsState == null) {
    return true;
  }

  try {
    convertYjsStateToJsonContent(
      Uint8Array.from(yjsState),
      taskDescriptionSchema
    );
    return true;
  } catch {
    return false;
  }
}

function encodeYjsState(content: JSONContent): number[] | null {
  const encoded = convertJsonContentToYjsState(content, taskDescriptionSchema);
  if (encoded.length === 0) {
    return null;
  }
  return Array.from(encoded);
}

/**
 * Derives a task-description Yjs state array from TipTap JSON or plain text.
 * Returns null for empty descriptions or when conversion cannot succeed.
 */
export function deriveTaskDescriptionYjsState(
  description: string | null | undefined
): number[] | null {
  const normalizedDescription = description?.trim();
  if (!normalizedDescription) {
    return null;
  }

  const content = parseTaskDescriptionContent(normalizedDescription);
  if (!hasMeaningfulTaskDescriptionContent(content)) {
    return null;
  }

  try {
    return encodeYjsState(content);
  } catch {
    const fallbackText = getDescriptionText(normalizedDescription).trim();
    if (!fallbackText) {
      return null;
    }

    try {
      return encodeYjsState({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: fallbackText }],
          },
        ],
      });
    } catch {
      return null;
    }
  }
}
