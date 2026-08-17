import type { Fragment, Mark, Node, Slice } from '@tiptap/pm/model';
import type { JSONContent } from '@tiptap/react';

/**
 * Node types that are considered images and need to be extracted from paragraphs
 * when migrating from inline to block-level mode.
 */
const IMAGE_NODE_TYPES = ['image', 'imageResize'];

function getContentChildren(node: JSONContent): JSONContent[] | null {
  return Array.isArray(node.content) ? node.content : null;
}

/**
 * Migrates content from inline images (inside paragraphs) to block-level images.
 * This ensures backward compatibility when switching from inline: true to inline: false.
 *
 * Before (inline):
 * ```json
 * {
 *   "type": "paragraph",
 *   "content": [
 *     { "type": "text", "text": "Here is an image: " },
 *     { "type": "imageResize", "attrs": { "src": "...", "width": 480 } }
 *   ]
 * }
 * ```
 *
 * After (block):
 * ```json
 * {
 *   "type": "paragraph",
 *   "content": [{ "type": "text", "text": "Here is an image:" }]
 * },
 * {
 *   "type": "imageResize",
 *   "attrs": { "src": "...", "width": 480 }
 * }
 * ```
 */
export function migrateInlineImagesToBlock(
  content: JSONContent | null
): JSONContent | null {
  if (!content) return content;

  const contentChildren = getContentChildren(content);
  if (!contentChildren) return content;

  const newContent: JSONContent[] = [];

  for (const node of contentChildren) {
    // Recursively migrate nested structures (lists, blockquotes, etc.)
    if (
      getContentChildren(node) &&
      !IMAGE_NODE_TYPES.includes(node.type || '')
    ) {
      const migratedNode = migrateNodeContent(node);
      if (migratedNode.extractedImages.length > 0) {
        // Add the node with non-image content (if it has any)
        if (hasNonEmptyContent(migratedNode.node)) {
          newContent.push(migratedNode.node);
        }
        // Add extracted images as block-level nodes
        newContent.push(...migratedNode.extractedImages);
      } else {
        newContent.push(migratedNode.node);
      }
    } else {
      newContent.push(node);
    }
  }

  return {
    ...content,
    content: newContent,
  };
}

interface MigratedNode {
  node: JSONContent;
  extractedImages: JSONContent[];
}

/**
 * Recursively migrates a node's content, extracting inline images from paragraphs.
 */
function migrateNodeContent(node: JSONContent): MigratedNode {
  const contentChildren = getContentChildren(node);

  // Handle paragraph nodes - extract inline images
  if (node.type === 'paragraph' && contentChildren?.length) {
    return extractImagesFromParagraph(node);
  }

  // Handle container nodes (list items, blockquotes, table cells, etc.) - recurse into children
  if (contentChildren?.length) {
    const migratedChildren: JSONContent[] = [];
    const allExtractedImages: JSONContent[] = [];

    for (const child of contentChildren) {
      if (
        getContentChildren(child) &&
        !IMAGE_NODE_TYPES.includes(child.type || '')
      ) {
        const result = migrateNodeContent(child);

        if (result.extractedImages.length > 0) {
          // Only add the child if it has non-empty content
          if (hasNonEmptyContent(result.node)) {
            migratedChildren.push(result.node);
          }
          allExtractedImages.push(...result.extractedImages);
        } else {
          migratedChildren.push(result.node);
        }
      } else {
        migratedChildren.push(child);
      }
    }

    return {
      node: { ...node, content: migratedChildren },
      extractedImages: allExtractedImages,
    };
  }

  return { node, extractedImages: [] };
}

/**
 * Extracts image nodes from a paragraph, returning the text-only paragraph
 * and the extracted images separately.
 */
function extractImagesFromParagraph(paragraph: JSONContent): MigratedNode {
  const contentChildren = getContentChildren(paragraph);

  if (!contentChildren) {
    return { node: paragraph, extractedImages: [] };
  }

  const textContent: JSONContent[] = [];
  const images: JSONContent[] = [];

  for (const child of contentChildren) {
    if (IMAGE_NODE_TYPES.includes(child.type || '')) {
      images.push(child);
    } else {
      textContent.push(child);
    }
  }

  // If no images were extracted, return original
  if (images.length === 0) {
    return { node: paragraph, extractedImages: [] };
  }

  // Return paragraph with text-only content, and extracted images
  return {
    node: { ...paragraph, content: textContent },
    extractedImages: images,
  };
}

/**
 * Checks if a node has non-empty content (text or meaningful children).
 * Empty paragraphs should be filtered out when all content was extracted.
 */
function hasNonEmptyContent(node: JSONContent): boolean {
  const contentChildren = getContentChildren(node);
  if (!contentChildren || contentChildren.length === 0) return false;

  return contentChildren.some((child) => {
    // Check for text content
    if (child.text && child.text.trim().length > 0) return true;

    // Check for meaningful node types (not just empty containers)
    if (
      child.type &&
      ['hardBreak', 'mention', 'image', 'imageResize', 'video'].includes(
        child.type
      )
    ) {
      return true;
    }

    // Recursively check children
    if (getContentChildren(child)) return hasNonEmptyContent(child);

    return false;
  });
}

/**
 * Checks if content contains any inline images that need migration.
 * Used to avoid unnecessary processing.
 */
export function needsMigration(content: JSONContent | null): boolean {
  if (!content) return false;

  const contentChildren = getContentChildren(content);
  if (!contentChildren) return false;

  function checkNode(node: JSONContent): boolean {
    const nodeChildren = getContentChildren(node);

    // Check if this is a paragraph with inline images
    if (node.type === 'paragraph' && nodeChildren?.length) {
      const hasImage = nodeChildren.some((child) =>
        IMAGE_NODE_TYPES.includes(child.type || '')
      );
      if (hasImage) return true;
    }

    // Recursively check children
    if (nodeChildren?.length) {
      return nodeChildren.some((child) => checkNode(child));
    }

    return false;
  }

  return contentChildren.some((node) => checkNode(node));
}

function wrapMarkedText(text: string, marks: readonly Mark[]): string {
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

function serializeInlineContent(node: Node): string {
  let result = '';
  node.forEach((child) => {
    if (child.isText) result += wrapMarkedText(child.text ?? '', child.marks);
    else if (child.type.name === 'hardBreak') result += '\n';
    else if (child.type.name === 'mention') {
      result += child.attrs.displayName
        ? `@${String(child.attrs.displayName)}`
        : '@mention';
    } else if (
      child.type.name === 'image' ||
      child.type.name === 'imageResize'
    ) {
      const src = typeof child.attrs.src === 'string' ? child.attrs.src : '';
      const alt = typeof child.attrs.alt === 'string' ? child.attrs.alt : '';
      result += src ? `![${alt}](${src})` : alt;
    } else result += serializeInlineContent(child);
  });
  return result;
}

function serializeListItem(node: Node, marker: string, depth: number): string {
  const indent = '  '.repeat(depth);
  const prefix = `${marker} `;
  const lines: string[] = [];
  let hasMarker = false;

  node.forEach((child) => {
    if (['bulletList', 'orderedList', 'taskList'].includes(child.type.name)) {
      lines.push(serializeList(child, depth + 1));
      return;
    }

    const text = serializeBlock(child, depth).trimEnd();
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

function serializeList(node: Node, depth: number): string {
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
          ? item.attrs.checked === true
            ? '- [x]'
            : '- [ ]'
          : '-';
    lines.push(serializeListItem(item, marker, depth));
  });
  return lines.join('\n');
}

function serializeTable(node: Node): string {
  const rows: string[][] = [];
  node.forEach((row) => {
    const cells: string[] = [];
    row.forEach((cell) => {
      cells.push(serializeBlocks(cell.content).replace(/\n+/g, ' ').trim());
    });
    rows.push(cells);
  });
  if (rows.length === 0) return '';

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

function serializeBlock(node: Node, depth = 0): string {
  switch (node.type.name) {
    case 'paragraph':
      return serializeInlineContent(node);
    case 'heading': {
      const level = typeof node.attrs.level === 'number' ? node.attrs.level : 1;
      return `${'#'.repeat(Math.min(6, Math.max(1, level)))} ${serializeInlineContent(node)}`;
    }
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return serializeList(node, depth);
    case 'blockquote':
      return serializeBlocks(node.content)
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
    case 'codeBlock': {
      const language =
        typeof node.attrs.language === 'string' ? node.attrs.language : '';
      return `\`\`\`${language}\n${node.textContent}\n\`\`\``;
    }
    case 'horizontalRule':
      return '---';
    case 'table':
      return serializeTable(node);
    case 'video':
      return node.attrs.src ? `[Video](${String(node.attrs.src)})` : '';
    case 'details':
    case 'detailsContent':
      return serializeBlocks(node.content);
    case 'detailsSummary': {
      const level =
        typeof node.attrs.level === 'number' ? node.attrs.level : null;
      const summary = serializeInlineContent(node);
      return level ? `${'#'.repeat(level)} ${summary}` : summary;
    }
    default:
      return serializeBlocks(node.content);
  }
}

function serializeBlocks(fragment: Fragment): string {
  const blocks: string[] = [];
  fragment.forEach((node) => {
    blocks.push(serializeBlock(node));
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

export function serializeClipboardText(slice: Slice): string {
  return collapseExcessBlankLines(
    serializeBlocks(slice.content)
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+$/gm, '')
  ).replace(/^\n+|\n+$/g, '');
}
