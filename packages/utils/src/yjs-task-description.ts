import type { JSONContent } from '@tiptap/core';
import {
  decodeTaskDescriptionYjsState,
  encodeTaskDescriptionYjsState,
  parsePersistedTaskDescriptionContent,
  parseTaskDescriptionInput,
} from './task-description-codec';
import {
  hasMeaningfulTaskDescriptionContent,
  isValidTaskDescriptionContent,
  taskDescriptionSchema,
} from './task-description-content';
import { getDescriptionText } from './text-helper';

export { isValidTaskDescriptionContent, taskDescriptionSchema };

export function isValidTaskDescriptionYjsState(
  yjsState: number[] | null | undefined
): boolean {
  if (yjsState == null) {
    return true;
  }

  try {
    decodeTaskDescriptionYjsState(yjsState);
    return true;
  } catch {
    return false;
  }
}

function encodeYjsState(content: JSONContent): number[] | null {
  const encoded = encodeTaskDescriptionYjsState(content);
  if (encoded.length === 0) {
    return null;
  }
  return encoded;
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

  const content = parsePersistedTaskDescriptionContent({
    description: normalizedDescription,
  });
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
      return encodeYjsState(parseTaskDescriptionInput(fallbackText, 'text'));
    } catch {
      return null;
    }
  }
}
