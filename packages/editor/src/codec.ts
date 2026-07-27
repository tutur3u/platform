import type { JSONContent } from './types.js';

const textNode = (text: string): JSONContent => ({ text, type: 'text' });

export function markdownToJSON(markdown: string): JSONContent {
  const content: JSONContent[] = [];
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^#{1,3}\s/.test(line)) {
      const marker = line.match(/^#+/)?.[0] ?? '#';
      content.push({
        attrs: { level: marker.length },
        content: [textNode(line.slice(marker.length).trim())],
        type: 'heading',
      });
    } else if (/^>\s?/.test(line)) {
      content.push({
        content: [
          { content: [textNode(line.replace(/^>\s?/, ''))], type: 'paragraph' },
        ],
        type: 'blockquote',
      });
    } else if (/^---+$/.test(line.trim())) {
      content.push({ type: 'horizontalRule' });
    } else {
      content.push({
        content: line ? [textNode(line)] : [],
        type: 'paragraph',
      });
    }
  }
  return { content, type: 'doc' };
}

function nodeToMarkdown(node: JSONContent): string {
  const children = (node.content ?? []).map(nodeToMarkdown).join('');
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'heading')
    return `${'#'.repeat(Number(node.attrs?.level ?? 2))} ${children}`;
  if (node.type === 'blockquote')
    return children
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
  if (node.type === 'horizontalRule') return '---';
  if (node.type === 'paragraph') return children;
  if (node.type === 'bulletList')
    return (node.content ?? [])
      .map((item) => `- ${nodeToMarkdown(item)}`)
      .join('\n');
  if (node.type === 'orderedList')
    return (node.content ?? [])
      .map((item, index) => `${index + 1}. ${nodeToMarkdown(item)}`)
      .join('\n');
  if (node.type === 'listItem') return children;
  return children;
}

export function jsonToMarkdown(content: JSONContent | null): string {
  return (content?.content ?? []).map(nodeToMarkdown).join('\n\n').trim();
}

export function extractPlainText(content: JSONContent | null): string {
  if (!content) return '';
  const parts: string[] = [];
  const visit = (node: JSONContent) => {
    if (node.text) parts.push(node.text);
    for (const child of node.content ?? []) visit(child);
    if (
      ['paragraph', 'heading', 'listItem', 'blockquote'].includes(
        node.type ?? ''
      )
    )
      parts.push('\n');
  };
  visit(content);
  return parts
    .join('')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
