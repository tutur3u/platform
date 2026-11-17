import type { JSONContent } from '@tiptap/react';

/**
 * The description as plain text, one line per paragraph, or `null` when it
 * holds rich content (marks, lists, media) that a plain field would lose.
 */
export function getQuickCreateDescriptionText(
  content: JSONContent | null | undefined
): string | null {
  if (!content) return '';
  if (content.type !== 'doc') return null;

  const lines: string[] = [];
  for (const block of content.content ?? []) {
    if (block.type !== 'paragraph') return null;

    let line = '';
    for (const node of block.content ?? []) {
      if (node.type !== 'text' || node.marks?.length) return null;
      line += node.text ?? '';
    }
    lines.push(line);
  }

  return lines.join('\n');
}

/** A plain-text description as editor content; empty text clears it. */
export function createQuickCreateDescription(text: string): JSONContent | null {
  if (!text) return null;

  return {
    type: 'doc',
    content: text
      .split('\n')
      .map((line) =>
        line
          ? { type: 'paragraph', content: [{ type: 'text', text: line }] }
          : { type: 'paragraph' }
      ),
  };
}
