import type { JSONContent } from './types.js';

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character] ?? character
  );

function renderNode(node: JSONContent): string {
  let children = (node.content ?? []).map(renderNode).join('');
  if (node.type === 'text') {
    children = escapeHtml(node.text ?? '');
    for (const mark of node.marks ?? []) {
      if (mark.type === 'bold') children = `<strong>${children}</strong>`;
      if (mark.type === 'italic') children = `<em>${children}</em>`;
      if (mark.type === 'link')
        children = `<a href="${escapeHtml(String(mark.attrs?.href ?? ''))}">${children}</a>`;
    }
    return children;
  }
  if (node.type === 'doc') return children;
  if (node.type === 'paragraph') return `<p>${children}</p>`;
  if (node.type === 'heading')
    return `<h${Number(node.attrs?.level ?? 2)}>${children}</h${Number(node.attrs?.level ?? 2)}>`;
  if (node.type === 'blockquote') return `<blockquote>${children}</blockquote>`;
  if (node.type === 'bulletList') return `<ul>${children}</ul>`;
  if (node.type === 'orderedList') return `<ol>${children}</ol>`;
  if (node.type === 'listItem') return `<li>${children}</li>`;
  if (node.type === 'horizontalRule') return '<hr>';
  if (node.type === 'image')
    return `<img src="${escapeHtml(String(node.attrs?.src ?? ''))}" alt="${escapeHtml(String(node.attrs?.alt ?? ''))}">`;
  return children;
}

/** Server-safe: no DOM, React, or editor runtime required. */
export function renderRichTextToHTML(content: JSONContent | null): string {
  return content ? renderNode(content) : '';
}
