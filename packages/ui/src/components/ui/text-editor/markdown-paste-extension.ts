import { DOMParser as ProseMirrorDOMParser } from '@tiptap/pm/model';
import { Extension } from '@tiptap/react';
import { Plugin, PluginKey } from 'prosemirror-state';

// ---------------------------------------------------------------------------
// Markdown -> HTML converter (toolbar-supported features only)
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const BLOCK_START_PATTERNS = [
  /^#{1,6}\s/,
  /^\s*[-*+]\s/,
  /^\s*\d+\.\s/,
  /^\s*```/,
  /^\s*>/,
  /^\s*---\s*$/,
  /^\s*\*\*\*\s*$/,
  /^\s*___\s*$/,
  /^\s*\|/,
];

function isBlockStart(line: string): boolean {
  return BLOCK_START_PATTERNS.some((p) => p.test(line));
}

function sanitizeLinkUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
    return trimmed;
  }
  return '';
}

function sanitizeImageUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return '';
}

function parseInline(text: string): string {
  // Step 1: Tokenize code spans so later replacements don't touch them
  const codeTokens: string[] = [];
  let html = text.replace(/`([^`\n]+)`/g, (_match, code) => {
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return `\0CODE${codeTokens.length - 1}\0`;
  });

  // Step 2: Escape remaining text
  html = escapeHtml(html);

  // Step 3: Apply inline formatting (order matters)

  // Highlight: ==text==
  html = html.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');

  // Strikethrough: ~~text~~
  html = html.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');

  // Bold + Italic: ***text***
  html = html.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>');

  // Bold: **text**
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');

  // Italic: *text* (but not inside words)
  html = html.replace(
    /(?<![A-Za-z0-9])\*([^*\n]+)\*(?![A-Za-z0-9])/g,
    '<em>$1</em>'
  );

  // Images: ![alt](url) — sanitize src
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
    const safeUrl = sanitizeImageUrl(url);
    return safeUrl
      ? `<img src="${safeUrl}" alt="${escapeHtml(alt)}" />`
      : escapeHtml(`![${alt}](${url})`);
  });

  // Links: [text](url) — sanitize href
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, linkText, url) => {
    const safeUrl = sanitizeLinkUrl(url);
    return safeUrl
      ? `<a href="${safeUrl}">${escapeHtml(linkText)}</a>`
      : escapeHtml(`[${linkText}](${url})`);
  });

  // Step 4: Restore code tokens
  html = html.replace(
    /\0CODE(\d+)\0/g,
    (_match, index) => codeTokens[Number(index)] ?? ''
  );

  return html;
}

// ---------------------------------------------------------------------------
// Tree-based list parser (supports nested lists and task lists)
// ---------------------------------------------------------------------------

interface ListNode {
  content: string;
  checked: boolean | null;
  marker: string;
  indent: number;
  children: ListNode[];
}

function parseListTree(
  lines: string[],
  startIndex: number,
  minIndent: number
): { nodes: ListNode[]; endIndex: number } {
  const nodes: ListNode[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined || line.trim() === '') {
      i++;
      continue;
    }

    const match = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
    if (!match) break;

    const indent = match[1] ? match[1].length : 0;
    if (indent < minIndent) break;

    const marker = match[2] || '';
    let content = match[3] || '';

    // Check for task list: - [ ] or - [x]
    let checked: boolean | null = null;
    const taskMatch = content.match(/^\[([ xX])\]\s+(.*)$/);
    if (taskMatch) {
      checked = taskMatch[1] ? taskMatch[1].toLowerCase() === 'x' : false;
      content = taskMatch[2] || '';
    }

    i++;

    // Collect non-list continuation lines for this item
    const contentLines: string[] = [content];
    while (i < lines.length) {
      const nextLine = lines[i];
      if (nextLine === undefined) break;

      if (nextLine.trim() === '') {
        // Blank line — keep scanning to see if indented content follows
        let j = i + 1;
        while (
          j < lines.length &&
          lines[j] !== undefined &&
          lines[j]!.trim() === ''
        )
          j++;
        const afterBlank = lines[j];
        if (afterBlank !== undefined) {
          const afterIndent = afterBlank.match(/^(\s*)/)?.[1]?.length ?? 0;
          if (afterIndent > indent) {
            // Indented content after blank line → part of this item
            i++;
            continue;
          }
        }
        break;
      }

      const nextMatch = nextLine.match(/^(\s*)/);
      const nextIndent = nextMatch?.[1]?.length ?? 0;
      const isListLine = nextLine.match(/^(\s*)([-*+]|\d+\.)\s+/);

      if (isListLine) {
        if (nextIndent > indent) {
          // Nested list starts here — stop collecting content
          break;
        }
        // Same level or back to parent → new item, stop
        break;
      }

      if (nextIndent > indent) {
        // Indented continuation text
        contentLines.push(nextLine.slice(indent + 2));
        i++;
      } else {
        // Not indented, not a list line → end of this item
        break;
      }
    }

    const node: ListNode = {
      indent,
      marker,
      content: contentLines.join('\n'),
      checked,
      children: [],
    };

    // Check for nested list at current position
    if (i < lines.length) {
      const nextLine = lines[i];
      if (nextLine !== undefined) {
        const nextMatch = nextLine.match(/^(\s*)([-*+]|\d+\.)\s+/);
        if (nextMatch) {
          const nextIndent = nextMatch[1] ? nextMatch[1].length : 0;
          if (nextIndent > indent) {
            const { nodes: childNodes, endIndex } = parseListTree(
              lines,
              i,
              nextIndent
            );
            node.children = childNodes;
            i = endIndex;
          }
        }
      }
    }

    nodes.push(node);
  }

  return { nodes, endIndex: i };
}

function renderListTree(nodes: ListNode[], ordered: boolean): string {
  if (nodes.length === 0) return '';

  const tag = ordered ? 'ol' : 'ul';
  const isTaskList = nodes.some((n) => n.checked !== null);
  const dataType = isTaskList ? ' data-type="taskList"' : '';

  let html = `<${tag}${dataType}>`;

  for (const node of nodes) {
    if (isTaskList) {
      html += `<li data-type="taskItem" data-checked="${node.checked}"><div>`;
      html += `<p>${parseInline(node.content)}</p>`;
      if (node.children.length > 0) {
        const childOrdered = /^\d+\.$/.test(node.children[0]?.marker || '');
        html += renderListTree(node.children, childOrdered);
      }
      html += '</div></li>';
    } else {
      html += `<li><p>${parseInline(node.content)}</p>`;
      if (node.children.length > 0) {
        const childOrdered = /^\d+\.$/.test(node.children[0]?.marker || '');
        html += renderListTree(node.children, childOrdered);
      }
      html += '</li>';
    }
  }

  html += `</${tag}>`;
  return html;
}

function parseTable(
  lines: string[],
  startIndex: number
): { html: string; endIndex: number } {
  let i = startIndex;
  const rows: string[][] = [];

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined || !line.trim().startsWith('|')) break;

    const cells = line
      .split('|')
      .map((c) => c.trim())
      .filter((_, idx, arr) => idx !== 0 || arr[0] !== '');
    // Remove leading/trailing empty cells caused by outer pipes
    const cleaned = cells.filter(
      (c, idx) =>
        !(idx === 0 && c === '') && !(idx === cells.length - 1 && c === '')
    );
    rows.push(cleaned.length > 0 ? cleaned : cells);
    i++;
  }

  // Remove separator row (second row if it looks like ---|---|---)
  const hasSeparator =
    rows.length > 1 && rows[1]!.every((c) => /^:?-+:?$/.test(c));
  const dataRows = hasSeparator ? [rows[0]!, ...rows.slice(2)] : rows;

  if (dataRows.length === 0) {
    return { html: '', endIndex: startIndex };
  }

  let html = '<table>';

  // Header row
  html += '<thead><tr>';
  for (const cell of dataRows[0]!) {
    html += `<th><p>${parseInline(cell)}</p></th>`;
  }
  html += '</tr></thead>';

  // Body rows
  if (dataRows.length > 1) {
    html += '<tbody>';
    for (let r = 1; r < dataRows.length; r++) {
      html += '<tr>';
      for (const cell of dataRows[r]!) {
        html += `<td><p>${parseInline(cell)}</p></td>`;
      }
      html += '</tr>';
    }
    html += '</tbody>';
  }

  html += '</table>';
  return { html, endIndex: i };
}

function markdownToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined || line.trim() === '') {
      i++;
      continue;
    }

    // Code block
    const codeBlockMatch = line.match(/^\s*```\s*(\w*)\s*$/);
    if (codeBlockMatch) {
      const lang = codeBlockMatch[1] || '';
      const start = i + 1;
      i++;
      while (
        i < lines.length &&
        lines[i] !== undefined &&
        !lines[i]!.match(/^\s*```\s*$/)
      ) {
        i++;
      }
      const code = lines.slice(start, i).join('\n');
      result.push(
        `<pre><code${lang ? ` class="language-${escapeHtml(lang)}"` : ''}>${escapeHtml(code)}</code></pre>`
      );
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1]!.length;
      const content = headingMatch[2] || '';
      result.push(`<h${level}>${parseInline(content)}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(\s*---\s*|\s*\*\*\*\s*|\s*___\s*)$/.test(line)) {
      result.push('<hr>');
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines: string[] = [];
      while (
        i < lines.length &&
        lines[i] !== undefined &&
        lines[i]!.startsWith('>')
      ) {
        quoteLines.push(lines[i]!.slice(1).trimStart());
        i++;
      }
      result.push(
        `<blockquote><p>${parseInline(quoteLines.join(' '))}</p></blockquote>`
      );
      continue;
    }

    // List
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+/);
    if (listMatch) {
      const indent = listMatch[1] ? listMatch[1].length : 0;
      const { nodes, endIndex } = parseListTree(lines, i, indent);
      const ordered = /^\d+\.$/.test(nodes[0]?.marker || '');
      result.push(renderListTree(nodes, ordered));
      i = endIndex;
      continue;
    }

    // Table
    if (line.trim().startsWith('|')) {
      const { html, endIndex } = parseTable(lines, i);
      if (html) {
        result.push(html);
        i = endIndex;
        continue;
      }
    }

    // Paragraph
    const paraLines: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i] !== undefined &&
      lines[i]!.trim() !== '' &&
      !isBlockStart(lines[i]!)
    ) {
      paraLines.push(lines[i]!);
      i++;
    }
    result.push(`<p>${parseInline(paraLines.join(' '))}</p>`);
  }

  return result.join('\n');
}

// ---------------------------------------------------------------------------
// Heuristic: does this text look like Markdown?
// ---------------------------------------------------------------------------

const MARKDOWN_SIGNATURES = [
  /^#{1,6}\s/m, // heading
  /\*\*[^*]+\*\*/m, // bold
  /\*[^*\n]+\*/m, // italic
  /~~[^~]+~~/m, // strikethrough
  /==[^=]+==/m, // highlight
  /`[^`]+`/m, // inline code
  /^\s*```/m, // code block
  /^\s*>\s/m, // blockquote
  /^\s*[-*+]\s/m, // bullet list
  /^\s*\d+\.\s/m, // ordered list
  /^\s*[-*+]\s+\[[ xX]\]/m, // task list
  /!\[[^\]]*\]\([^)]+\)/m, // image
  /\[[^\]]+\]\([^)]+\)/m, // link
  /^\s*---\s*$/m, // horizontal rule
  /^\s*\|.*\|/m, // table
];

function looksLikeMarkdown(text: string): boolean {
  return MARKDOWN_SIGNATURES.some((pattern) => pattern.test(text));
}

// ---------------------------------------------------------------------------
// Test-only exports (not part of the public API contract)
// ---------------------------------------------------------------------------

export const __markdownPastePrivate = {
  markdownToHtml,
  looksLikeMarkdown,
};

const markdownPastePluginKey = new PluginKey('markdownPastePlugin');

// ---------------------------------------------------------------------------
// Tiptap extension
// ---------------------------------------------------------------------------

export const MarkdownPaste = Extension.create({
  name: 'markdownPaste',
  priority: 200,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: markdownPastePluginKey,
        props: {
          handleDOMEvents: {
            paste: (
              view: import('@tiptap/pm/view').EditorView,
              event: ClipboardEvent
            ) => {
              const clipboardData = event.clipboardData;
              if (!clipboardData) return false;

              // If files are present, let image/video paste plugins handle it
              if (clipboardData.files.length > 0) {
                return false;
              }

              const text = clipboardData.getData('text/plain');
              if (!text || !looksLikeMarkdown(text)) {
                return false;
              }

              // When plain text looks like markdown, convert it to editor nodes
              // even if HTML is also present on the clipboard. Many apps wrap
              // markdown in simple HTML tags that Tiptap would insert as plain
              // text paragraphs; we prefer structured conversion instead.
              event.preventDefault();

              const html = markdownToHtml(text);
              const { state } = view;
              const { from, to } = state.selection;

              // Parse the generated HTML into a ProseMirror slice
              const browserParser = new DOMParser();
              const dom = browserParser.parseFromString(
                `<div>${html}</div>`,
                'text/html'
              );
              const firstChild = dom.body.firstChild;
              if (!firstChild) return false;

              const slice = ProseMirrorDOMParser.fromSchema(
                state.schema
              ).parseSlice(firstChild as Element);

              const tr = state.tr.replaceRange(from, to, slice);
              view.dispatch(tr);

              return true;
            },
          },
        },
      }),
    ];
  },
});
