import type { Fragment, Mark, Node, Slice } from '@tiptap/pm/model';

type ClipboardFormat = 'markdown' | 'text';

function wrapMarkedText(
  text: string,
  marks: readonly Mark[],
  format: ClipboardFormat
): string {
  if (format === 'text') return text;

  const marksByName = new Map(marks.map((mark) => [mark.type.name, mark]));
  let result = text;

  if (marksByName.has('code')) {
    const fence = result.includes('`') ? '``' : '`';
    result = `${fence}${result}${fence}`;
  }
  if (marksByName.has('bold')) result = `**${result}**`;
  if (marksByName.has('italic')) result = `*${result}*`;
  if (marksByName.has('strike')) result = `~~${result}~~`;
  if (marksByName.has('highlight')) result = `==${result}==`;
  if (marksByName.has('subscript')) result = `<sub>${result}</sub>`;
  if (marksByName.has('superscript')) result = `<sup>${result}</sup>`;

  const link = marksByName.get('link');
  const href = typeof link?.attrs.href === 'string' ? link.attrs.href : '';
  return href ? `[${result}](${href})` : result;
}

function serializeInlineContent(node: Node, format: ClipboardFormat): string {
  let result = '';
  node.forEach((child) => {
    if (child.isText) {
      result += wrapMarkedText(child.text ?? '', child.marks, format);
    } else if (child.type.name === 'hardBreak') {
      result += '\n';
    } else if (child.type.name === 'mention') {
      result += child.attrs.displayName
        ? `@${String(child.attrs.displayName)}`
        : '@mention';
    } else if (
      child.type.name === 'image' ||
      child.type.name === 'imageResize'
    ) {
      const src = typeof child.attrs.src === 'string' ? child.attrs.src : '';
      const alt = typeof child.attrs.alt === 'string' ? child.attrs.alt : '';
      if (format === 'markdown') result += src ? `![${alt}](${src})` : alt;
      else result += [alt || 'Image', src].filter(Boolean).join(': ');
    } else {
      result += serializeInlineContent(child, format);
    }
  });
  return result;
}

function serializeListItem(
  node: Node,
  marker: string,
  depth: number,
  format: ClipboardFormat
): string {
  const indent = '  '.repeat(depth);
  const prefix = `${marker} `;
  const lines: string[] = [];
  let hasMarker = false;

  node.forEach((child) => {
    if (['bulletList', 'orderedList', 'taskList'].includes(child.type.name)) {
      lines.push(serializeList(child, depth + 1, format));
      return;
    }

    const text = serializeBlock(child, depth, format).trimEnd();
    if (!hasMarker) {
      const continuation = ' '.repeat(prefix.length);
      const marked = text
        .split('\n')
        .map((line, index) => (index === 0 ? line : `${continuation}${line}`))
        .join('\n');
      lines.push(`${indent}${prefix}${marked}`);
      hasMarker = true;
      return;
    }

    const continuation = `${indent}${' '.repeat(prefix.length)}`;
    lines.push(
      text
        .split('\n')
        .map((line) => `${continuation}${line}`)
        .join('\n')
    );
  });

  return lines.join('\n') || `${indent}${prefix.trimEnd()}`;
}

function serializeList(
  node: Node,
  depth: number,
  format: ClipboardFormat
): string {
  const start =
    node.type.name === 'orderedList' && typeof node.attrs.start === 'number'
      ? node.attrs.start
      : 1;
  const lines: string[] = [];
  node.forEach((item, _offset, index) => {
    const marker =
      node.type.name === 'orderedList'
        ? `${start + index}.`
        : node.type.name === 'taskList'
          ? format === 'markdown'
            ? item.attrs.checked === true
              ? '- [x]'
              : '- [ ]'
            : item.attrs.checked === true
              ? '☑'
              : '☐'
          : format === 'markdown'
            ? '-'
            : '•';
    lines.push(serializeListItem(item, marker, depth, format));
  });
  return lines.join('\n');
}

function serializeTable(node: Node, format: ClipboardFormat): string {
  const rows: string[][] = [];
  node.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => {
      cells.push(
        serializeBlocks(cell.content, format).replace(/\n+/g, ' ').trim()
      );
    });
    rows.push(cells);
  });
  if (rows.length === 0) return '';
  if (format === 'text') return rows.map((row) => row.join('\t')).join('\n');

  const width = Math.max(...rows.map((row) => row.length));
  const normalizedRows = rows.map((row) => [
    ...row,
    ...Array.from({ length: width - row.length }, () => ''),
  ]);
  const separator = Array.from({ length: width }, () => '---');
  return [normalizedRows[0] ?? [], separator, ...normalizedRows.slice(1)]
    .map((row) => `| ${row.join(' | ')} |`)
    .join('\n');
}

function serializeBlock(
  node: Node,
  depth = 0,
  format: ClipboardFormat
): string {
  switch (node.type.name) {
    case 'paragraph':
      return serializeInlineContent(node, format);
    case 'heading': {
      const text = serializeInlineContent(node, format);
      if (format === 'text') return text;
      const level = typeof node.attrs.level === 'number' ? node.attrs.level : 1;
      return `${'#'.repeat(Math.min(6, Math.max(1, level)))} ${text}`;
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return serializeList(node, depth, format);
    case 'blockquote': {
      const text = serializeBlocks(node.content, format);
      return format === 'text'
        ? text
        : text
            .split('\n')
            .map((line) => (line ? `> ${line}` : '>'))
            .join('\n');
    }
    case 'codeBlock': {
      if (format === 'text') return node.textContent;
      const language =
        typeof node.attrs.language === 'string' ? node.attrs.language : '';
      return `\`\`\`${language}\n${node.textContent}\n\`\`\``;
    }
    case 'horizontalRule':
      return '---';
    case 'table':
      return serializeTable(node, format);
    case 'video':
      return node.attrs.src
        ? format === 'markdown'
          ? `[Video](${String(node.attrs.src)})`
          : `Video: ${String(node.attrs.src)}`
        : '';
    case 'details':
    case 'detailsContent':
      return serializeBlocks(node.content, format);
    case 'detailsSummary': {
      const summary = serializeInlineContent(node, format);
      if (format === 'text') return summary;
      const level =
        typeof node.attrs.level === 'number' ? node.attrs.level : null;
      return level ? `${'#'.repeat(level)} ${summary}` : summary;
    }
    default:
      return serializeBlocks(node.content, format);
  }
}

function serializeBlocks(fragment: Fragment, format: ClipboardFormat): string {
  const blocks: string[] = [];
  fragment.forEach((node) => {
    blocks.push(serializeBlock(node, 0, format));
  });
  return blocks.join('\n\n');
}

export function collapseExcessBlankLines(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const normalized: string[] = [];
  let fenced = false;
  for (const line of lines) {
    const isFence = /^\s*(?:```|~~~)/.test(line);
    if (isFence) fenced = !fenced;
    if (!fenced && !isFence && line.trim() === '') {
      if (normalized.at(-1) !== '') normalized.push('');
    } else normalized.push(line);
  }
  return normalized.join('\n');
}

function serializeClipboard(slice: Slice, format: ClipboardFormat): string {
  return collapseExcessBlankLines(
    serializeBlocks(slice.content, format)
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+$/gm, '')
  ).replace(/^\n+|\n+$/g, '');
}

/** Markdown representation used for normal clipboard copy and explicit export. */
export function serializeClipboardText(slice: Slice): string {
  return serializeClipboard(slice, 'markdown');
}

/** Readable plain text without Markdown formatting delimiters. */
export function serializeClipboardPlainText(slice: Slice): string {
  return serializeClipboard(slice, 'text');
}
