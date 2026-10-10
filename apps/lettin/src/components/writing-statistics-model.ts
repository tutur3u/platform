import type { LettinNode } from '@tuturuuu/internal-api/lettin';

const words = new Intl.Segmenter('en', { granularity: 'word' });
const characters = new Intl.Segmenter('en', { granularity: 'grapheme' });
const leaves = new Set(['image', 'imageResize', 'horizontalRule']);
const blocks = new Set([
  'paragraph',
  'heading',
  'codeBlock',
  'tableCell',
  'tableHeader',
  'listItem',
  'taskItem',
  'detailsSummary',
]);

/** Visible body text only; attributes, marks and ignored leaf children are never counted. */
export function documentWritingStatistics(root: LettinNode) {
  const parts: string[] = [];
  let visited = 0;
  let truncated = false;
  const visit = (node: LettinNode, depth: number) => {
    if (visited >= 20_000) {
      truncated = true;
      return;
    }
    visited++;
    if (depth > 25) {
      truncated = true;
      return;
    }
    if (node.type === 'text') {
      parts.push(node.text ?? '');
      return;
    }
    if (leaves.has(node.type)) return;
    if (node.type === 'hardBreak') {
      parts.push('\n');
      return;
    }
    const children = node.content ?? [];
    for (let index = 0; index < children.length; index++) {
      visit(children[index]!, depth + 1);
      if (visited >= 20_000) {
        if (index < children.length - 1) truncated = true;
        break;
      }
    }
    if (blocks.has(node.type)) parts.push('\n');
  };
  visit(root, 0);
  const text = parts.join('');
  let wordCount = 0;
  let characterCount = 0;
  for (const segment of words.segment(text)) {
    if (segment.isWordLike) wordCount++;
  }
  for (const { segment } of characters.segment(text)) {
    if (!/^\s+$/u.test(segment)) characterCount++;
  }
  return { words: wordCount, characters: characterCount, truncated };
}
