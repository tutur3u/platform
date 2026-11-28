import { wikiDocumentSchema } from './schema';
import type { RichTextNode } from './types';
import { renderedLink, wikiHeadingAnchor } from './urls';

const escapes: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
function escape(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (char) => escapes[char] ?? char);
}

const tags: Record<string, string> = {
  paragraph: 'p',
  bulletList: 'ul',
  listItem: 'li',
  blockquote: 'blockquote',
  table: 'table',
  tableRow: 'tr',
  tableCell: 'td',
  tableHeader: 'th',
  details: 'details',
  detailsSummary: 'summary',
  detailsContent: 'div',
  bold: 'strong',
  italic: 'em',
  strike: 's',
  code: 'code',
  underline: 'u',
  subscript: 'sub',
  superscript: 'sup',
  highlight: 'mark',
};

function attribute(name: string, value: unknown): string {
  return value === undefined ? '' : ` ${name}="${escape(value)}"`;
}

/** Render only validated wiki content. The output uses static HTML and classes. */
export function renderWikiHtml(input: unknown): string {
  return render(wikiDocumentSchema.parse(input));
}

function render(node: RichTextNode): string {
  const attrs = node.attrs ?? {};
  const children = node.content?.map(render).join('') ?? '';
  switch (node.type) {
    case 'doc':
      return children;
    case 'text':
      return (node.marks ?? []).reduceRight(
        (html, mark) => {
          if (mark.type === 'link')
            return `<a${attribute('href', renderedLink(String(mark.attrs?.href)))}${attribute('title', mark.attrs?.title)} rel="noopener noreferrer">${html}</a>`;
          const tag = tags[mark.type];
          return `<${tag}>${html}</${tag}>`;
        },
        escape(node.text ?? '')
      );
    case 'heading': {
      const tag = `h${attrs.level}`;
      const id =
        typeof attrs.id === 'string' ? wikiHeadingAnchor(attrs.id) : undefined;
      return `<${tag}${attribute('id', id)}>${children}</${tag}>`;
    }
    case 'anchor':
      return `<span${attribute('id', wikiHeadingAnchor(String(attrs.id)))}></span>`;
    case 'hardBreak':
      return '<br>';
    case 'horizontalRule':
      return '<hr>';
    case 'orderedList':
      return `<ol${attribute('start', attrs.start)}>${children}</ol>`;
    case 'taskList':
      return `<ul class="wiki-task-list">${children}</ul>`;
    case 'taskItem': {
      const state = attrs.checked ? 'Completed task' : 'Incomplete task';
      return `<li><span role="img" aria-label="${state}">${attrs.checked ? '&#9745;' : '&#9744;'}</span> ${children}</li>`;
    }
    case 'codeBlock': {
      const caption =
        attrs.title === undefined
          ? ''
          : `<figcaption>${escape(attrs.title)}</figcaption>`;
      const language = attribute('data-language', attrs.language);
      return `<figure>${caption}<pre><code${language}>${children}</code></pre></figure>`;
    }
    case 'image':
    case 'imageResize':
      return `<img${attribute('src', attrs.src)}${attribute('alt', attrs.alt ?? '')}${attribute('title', attrs.title)}${attribute('width', attrs.width)}${attribute('height', attrs.height)} loading="lazy">`;
    case 'callout':
      return `<aside class="wiki-callout wiki-callout-${attrs.tone}">${children}</aside>`;
    case 'cardGrid':
      return `<div class="wiki-card-grid"${attribute('data-columns', attrs.cols)}>${children}</div>`;
    case 'card': {
      const title = escape(attrs.title);
      const label =
        typeof attrs.href === 'string'
          ? `<a${attribute('href', renderedLink(attrs.href))} rel="noopener noreferrer">${title}</a>`
          : title;
      return `<section class="wiki-card"><p><strong>${label}</strong></p>${children}</section>`;
    }
    case 'tableCell':
    case 'tableHeader': {
      const tag = tags[node.type];
      const align =
        typeof attrs.textAlign === 'string'
          ? `wiki-align-${attrs.textAlign}`
          : undefined;
      return `<${tag}${attribute('colspan', attrs.colspan)}${attribute('rowspan', attrs.rowspan)}${attribute('class', align)}>${children}</${tag}>`;
    }
    default: {
      const tag = tags[node.type];
      return `<${tag}>${children}</${tag}>`;
    }
  }
}
