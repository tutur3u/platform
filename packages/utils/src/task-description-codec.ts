import { Buffer } from 'node:buffer';
import type { JSONContent } from '@tiptap/core';
import { Node as ProseMirrorNode } from 'prosemirror-model';
import {
  hasMeaningfulTaskDescriptionContent,
  parseTaskDescriptionContent,
  taskDescriptionSchema,
} from './task-description-content';
import { getDescriptionText } from './text-helper';
import {
  convertJsonContentToYjsState,
  convertYjsStateToJsonContent,
} from './yjs-helper';

export type TaskDescriptionInputFormat = 'json' | 'markdown' | 'text';
export type TaskDescriptionYjsFormat = 'bytes-json' | 'yjs-base64';

export interface TaskDescriptionPayload {
  content: JSONContent;
  description: string | null;
  description_yjs_state: number[] | null;
}

type InlineMark = NonNullable<JSONContent['marks']>[number];
type ListKind = 'bulletList' | 'orderedList' | 'taskList';

const MARK_PATTERNS = [
  { mark: 'code', pattern: /`([^`]+)`/u },
  { mark: 'bold', pattern: /\*\*([^*]+)\*\*/u },
  { mark: 'strike', pattern: /~~(.+?)~~/u },
  { mark: 'italic', pattern: /\*([^*\n]+)\*/u },
] as const;

function textNode(text: string, marks?: JSONContent['marks']): JSONContent[] {
  if (!text) return [];
  return marks?.length
    ? [{ marks, text, type: 'text' }]
    : [{ text, type: 'text' }];
}

function withMark(type: InlineMark['type'], attrs?: InlineMark['attrs']) {
  const mark: InlineMark = { type };
  if (attrs && Object.keys(attrs).length > 0) {
    mark.attrs = attrs;
  }
  return mark;
}

function findEarliestInlineToken(text: string):
  | {
      attrs?: Record<string, unknown>;
      before: string;
      inner: string;
      mark: InlineMark['type'];
      rest: string;
    }
  | undefined {
  const linkMatch = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/u.exec(text);
  let best:
    | {
        attrs?: Record<string, unknown>;
        before: string;
        inner: string;
        index: number;
        mark: InlineMark['type'];
        rest: string;
      }
    | undefined;

  if (linkMatch?.index !== undefined) {
    best = {
      attrs: {
        href: linkMatch[2],
        rel: null,
        target: null,
        title: linkMatch[3] ?? null,
      },
      before: text.slice(0, linkMatch.index),
      index: linkMatch.index,
      inner: linkMatch[1] ?? '',
      mark: 'link',
      rest: text.slice(linkMatch.index + linkMatch[0].length),
    };
  }

  for (const { mark, pattern } of MARK_PATTERNS) {
    const match = pattern.exec(text);
    if (!match?.[0] || match.index === undefined) continue;
    if (best && match.index >= best.index) continue;

    best = {
      before: text.slice(0, match.index),
      index: match.index,
      inner: match[1] ?? '',
      mark,
      rest: text.slice(match.index + match[0].length),
    };
  }

  return best;
}

function parseInlineMarkdown(
  text: string,
  marks: JSONContent['marks'] = []
): JSONContent[] {
  const token = findEarliestInlineToken(text);
  if (!token) return textNode(text, marks);

  return [
    ...textNode(token.before, marks),
    ...parseInlineMarkdown(token.inner, [
      ...marks,
      withMark(token.mark, token.attrs),
    ]),
    ...parseInlineMarkdown(token.rest, marks),
  ];
}

function paragraphFromText(text: string, markdown = false): JSONContent {
  const lines = text.split('\n');
  const content: JSONContent[] = [];

  for (const [index, line] of lines.entries()) {
    if (index > 0) {
      content.push({ type: 'hardBreak' });
    }
    content.push(...(markdown ? parseInlineMarkdown(line) : textNode(line)));
  }

  return content.length > 0
    ? { content, type: 'paragraph' }
    : { type: 'paragraph' };
}

function codeBlockFromLines(lines: string[], language?: string): JSONContent {
  return {
    attrs: { language: language || null },
    content:
      lines.length > 0 ? [{ text: lines.join('\n'), type: 'text' }] : undefined,
    type: 'codeBlock',
  };
}

function isHorizontalRule(line: string) {
  return /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/u.test(line);
}

function getListLine(line: string):
  | {
      checked?: boolean;
      kind: ListKind;
      start?: number;
      text: string;
    }
  | undefined {
  const taskMatch = /^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/u.exec(line);
  if (taskMatch) {
    return {
      checked: taskMatch[1]?.toLowerCase() === 'x',
      kind: 'taskList',
      text: taskMatch[2] ?? '',
    };
  }

  const bulletMatch = /^\s*[-*+]\s+(.+)$/u.exec(line);
  if (bulletMatch) {
    return { kind: 'bulletList', text: bulletMatch[1] ?? '' };
  }

  const orderedMatch = /^\s*(\d+)[.)]\s+(.+)$/u.exec(line);
  if (orderedMatch) {
    return {
      kind: 'orderedList',
      start: Number.parseInt(orderedMatch[1] ?? '1', 10),
      text: orderedMatch[2] ?? '',
    };
  }
}

function isBlockStart(line: string) {
  return (
    /^```/u.test(line) ||
    /^#{1,6}\s+/u.test(line) ||
    /^>\s?/u.test(line) ||
    isHorizontalRule(line) ||
    Boolean(getListLine(line))
  );
}

function createListBlock(
  kind: ListKind,
  entries: Array<{ checked?: boolean; text: string }>,
  start?: number
): JSONContent {
  if (kind === 'taskList') {
    return {
      content: entries.map((entry) => ({
        attrs: { checked: entry.checked === true },
        content: [paragraphFromText(entry.text, true)],
        type: 'taskItem',
      })),
      type: 'taskList',
    };
  }

  return {
    attrs: kind === 'orderedList' ? { start: start ?? 1 } : undefined,
    content: entries.map((entry) => ({
      content: [paragraphFromText(entry.text, true)],
      type: 'listItem',
    })),
    type: kind,
  };
}

function parseMarkdownBlocks(markdown: string): JSONContent[] {
  const lines = markdown.replace(/\r\n?/gu, '\n').split('\n');
  const blocks: JSONContent[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = /^```([^\s`]*)\s*$/u.exec(line);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/u.test(lines[index] ?? '')) {
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(codeBlockFromLines(codeLines, fence[1]));
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (heading) {
      blocks.push({
        attrs: { level: heading[1]?.length ?? 1, textAlign: null },
        content: parseInlineMarkdown(heading[2] ?? ''),
        type: 'heading',
      });
      index += 1;
      continue;
    }

    if (isHorizontalRule(line)) {
      blocks.push({ type: 'horizontalRule' });
      index += 1;
      continue;
    }

    if (/^>\s?/u.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && /^>\s?/u.test(lines[index] ?? '')) {
        quoted.push((lines[index] ?? '').replace(/^>\s?/u, ''));
        index += 1;
      }
      const content = parseMarkdownBlocks(quoted.join('\n'));
      blocks.push({
        content: content.length > 0 ? content : [{ type: 'paragraph' }],
        type: 'blockquote',
      });
      continue;
    }

    const listLine = getListLine(line);
    if (listLine) {
      const entries: Array<{ checked?: boolean; text: string }> = [];
      const listKind = listLine.kind;
      const start = listLine.start;

      while (index < lines.length) {
        const item = getListLine(lines[index] ?? '');
        if (!item || item.kind !== listKind) break;
        entries.push({ checked: item.checked, text: item.text });
        index += 1;
      }

      blocks.push(createListBlock(listKind, entries, start));
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (
      index < lines.length &&
      (lines[index] ?? '').trim() &&
      !isBlockStart(lines[index] ?? '')
    ) {
      paragraphLines.push(lines[index] ?? '');
      index += 1;
    }
    blocks.push(paragraphFromText(paragraphLines.join('\n'), true));
  }

  return blocks;
}

export function createPlainTextTaskDescriptionContent(text: string) {
  const normalizedText = text.replace(/\r\n?/gu, '\n');
  const paragraphs = normalizedText.split(/\n{2,}/u);
  const content = paragraphs.map((paragraph) =>
    paragraphFromText(paragraph, false)
  );

  return {
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
    type: 'doc',
  } satisfies JSONContent;
}

export function parseMarkdownTaskDescriptionContent(markdown: string) {
  const content = parseMarkdownBlocks(markdown);
  return {
    content: content.length > 0 ? content : [{ type: 'paragraph' }],
    type: 'doc',
  } satisfies JSONContent;
}

export function normalizeTaskDescriptionContent(
  content: JSONContent
): JSONContent {
  const transformed = parseTaskDescriptionContent(JSON.stringify(content));
  return ProseMirrorNode.fromJSON(
    taskDescriptionSchema,
    transformed
  ).toJSON() as JSONContent;
}

export function parseTaskDescriptionJson(input: string): JSONContent {
  const parsed = JSON.parse(input) as unknown;
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    (parsed as JSONContent).type !== 'doc'
  ) {
    throw new Error('Task description JSON must be a TipTap doc object');
  }
  return normalizeTaskDescriptionContent(parsed as JSONContent);
}

export function parseTaskDescriptionInput(
  input: string,
  format: TaskDescriptionInputFormat = 'text'
): JSONContent {
  if (format === 'json') {
    return parseTaskDescriptionJson(input);
  }
  if (format === 'markdown') {
    return normalizeTaskDescriptionContent(
      parseMarkdownTaskDescriptionContent(input)
    );
  }
  return normalizeTaskDescriptionContent(
    createPlainTextTaskDescriptionContent(input)
  );
}

export function parsePersistedTaskDescriptionContent({
  description,
  description_yjs_state,
}: {
  description?: string | null;
  description_yjs_state?: number[] | null;
}): JSONContent {
  if (description_yjs_state && description_yjs_state.length > 0) {
    return decodeTaskDescriptionYjsState(description_yjs_state);
  }

  try {
    return normalizeTaskDescriptionContent(
      parseTaskDescriptionContent(description ?? '')
    );
  } catch {
    return normalizeTaskDescriptionContent(
      createPlainTextTaskDescriptionContent(
        getDescriptionText(description ?? '').trim()
      )
    );
  }
}

export function encodeTaskDescriptionYjsState(content: JSONContent): number[] {
  return Array.from(
    convertJsonContentToYjsState(
      normalizeTaskDescriptionContent(content),
      taskDescriptionSchema
    )
  );
}

export function decodeTaskDescriptionYjsState(
  yjsState: number[] | Uint8Array
): JSONContent {
  return convertYjsStateToJsonContent(
    yjsState instanceof Uint8Array ? yjsState : Uint8Array.from(yjsState),
    taskDescriptionSchema
  );
}

export function taskDescriptionYjsStateToBase64(
  yjsState: number[] | Uint8Array | null | undefined
): string | null {
  if (yjsState == null) return null;
  const bytes =
    yjsState instanceof Uint8Array ? yjsState : Uint8Array.from(yjsState);
  return Buffer.from(bytes).toString('base64');
}

export function taskDescriptionYjsStateFromBase64(input: string): number[] {
  return Array.from(Buffer.from(input.trim(), 'base64'));
}

export function taskDescriptionYjsStateFromBytesJson(input: string): number[] {
  const parsed = JSON.parse(input) as unknown;
  if (
    !Array.isArray(parsed) ||
    parsed.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    throw new Error('Yjs bytes JSON must be an array of byte values');
  }
  return parsed as number[];
}

export function taskDescriptionPlainText(content: JSONContent): string {
  return getDescriptionText(normalizeTaskDescriptionContent(content));
}

export function createTaskDescriptionPayload(
  input: string,
  format: TaskDescriptionInputFormat = 'text'
): TaskDescriptionPayload {
  const content = parseTaskDescriptionInput(input, format);

  if (!hasMeaningfulTaskDescriptionContent(content)) {
    return {
      content,
      description: null,
      description_yjs_state: null,
    };
  }

  return {
    content,
    description: JSON.stringify(content),
    description_yjs_state: encodeTaskDescriptionYjsState(content),
  };
}
