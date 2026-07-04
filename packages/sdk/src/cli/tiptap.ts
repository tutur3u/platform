import { readFile } from 'node:fs/promises';
import {
  decodeTaskDescriptionYjsState,
  encodeTaskDescriptionYjsState,
  parseTaskDescriptionInput,
  type TaskDescriptionInputFormat,
  type TaskDescriptionYjsFormat,
  taskDescriptionPlainText,
  taskDescriptionYjsStateFromBase64,
  taskDescriptionYjsStateFromBytesJson,
  taskDescriptionYjsStateToBase64,
} from '@tuturuuu/utils/task-description-codec';
import { type FlagValue, getFlag } from './args';

type TiptapOutputFormat = 'bytes-json' | 'json' | 'text' | 'yjs-base64';

interface TiptapCommandOptions {
  action?: string;
  flags: Record<string, FlagValue>;
  json: boolean;
}

function parseInputFormat(
  flags: Record<string, FlagValue>,
  fallback: TaskDescriptionInputFormat = 'text'
): TaskDescriptionInputFormat {
  const format = (getFlag(flags, 'format') || fallback).toLowerCase();
  if (format === 'json' || format === 'markdown' || format === 'text') {
    return format;
  }
  throw new Error(`Unsupported TipTap input format: ${format}`);
}

function parseYjsFormat(
  flags: Record<string, FlagValue>
): TaskDescriptionYjsFormat {
  const format = (getFlag(flags, 'format') || 'yjs-base64').toLowerCase();
  if (format === 'bytes-json' || format === 'yjs-base64') {
    return format;
  }
  throw new Error(`Unsupported Yjs input format: ${format}`);
}

function parseOutputFormat(
  flags: Record<string, FlagValue>,
  fallback: TiptapOutputFormat
): TiptapOutputFormat {
  const format = (getFlag(flags, 'output') || fallback).toLowerCase();
  if (
    format === 'bytes-json' ||
    format === 'json' ||
    format === 'text' ||
    format === 'yjs-base64'
  ) {
    return format;
  }
  throw new Error(`Unsupported TipTap output format: ${format}`);
}

async function readStdin() {
  let content = '';
  for await (const chunk of process.stdin) {
    content += chunk;
  }
  return content;
}

async function readInput(flags: Record<string, FlagValue>) {
  const inlineText = getFlag(flags, 'text');
  if (inlineText !== undefined) return inlineText;

  const filePath = getFlag(flags, 'input') || getFlag(flags, 'file');
  if (filePath) {
    return filePath === '-' ? readStdin() : readFile(filePath, 'utf8');
  }

  if (!process.stdin.isTTY) {
    return readStdin();
  }

  throw new Error(
    'Missing input. Use --input <path|->, --file <path|->, or --text.'
  );
}

function decodeYjsInput(input: string, format: TaskDescriptionYjsFormat) {
  return format === 'bytes-json'
    ? taskDescriptionYjsStateFromBytesJson(input)
    : taskDescriptionYjsStateFromBase64(input);
}

function writeOutput({
  format,
  json,
  value,
}: {
  format: TiptapOutputFormat | 'valid';
  json: boolean;
  value: unknown;
}) {
  if (json) {
    process.stdout.write(`${JSON.stringify({ format, value }, null, 2)}\n`);
    return;
  }

  if (format === 'json' || format === 'bytes-json') {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${String(value ?? '')}\n`);
}

export async function runTiptapCommand({
  action = 'parse',
  flags,
  json,
}: TiptapCommandOptions) {
  if (
    action !== 'decode' &&
    action !== 'encode' &&
    action !== 'parse' &&
    action !== 'validate'
  ) {
    throw new Error(`Unknown TipTap action: ${action}`);
  }

  const input = await readInput(flags);

  if (action === 'decode') {
    const content = decodeTaskDescriptionYjsState(
      decodeYjsInput(input, parseYjsFormat(flags))
    );
    const output = parseOutputFormat(flags, 'json');
    const value =
      output === 'text' ? taskDescriptionPlainText(content) : content;
    writeOutput({ format: output, json, value });
    return;
  }

  if (action === 'validate') {
    const format = getFlag(flags, 'format');
    if (format === 'bytes-json' || format === 'yjs-base64') {
      decodeTaskDescriptionYjsState(decodeYjsInput(input, format));
    } else {
      parseTaskDescriptionInput(input, parseInputFormat(flags, 'json'));
    }
    writeOutput({ format: 'valid', json, value: true });
    return;
  }

  const content = parseTaskDescriptionInput(input, parseInputFormat(flags));

  if (action === 'parse') {
    const output = parseOutputFormat(flags, 'json');
    const yjsState =
      output === 'yjs-base64' || output === 'bytes-json'
        ? encodeTaskDescriptionYjsState(content)
        : null;
    const value =
      output === 'text'
        ? taskDescriptionPlainText(content)
        : output === 'yjs-base64'
          ? taskDescriptionYjsStateToBase64(yjsState)
          : output === 'bytes-json'
            ? yjsState
            : content;
    writeOutput({ format: output, json, value });
    return;
  }

  const yjsState = encodeTaskDescriptionYjsState(content);
  const output = parseOutputFormat(flags, 'yjs-base64');
  const value =
    output === 'bytes-json'
      ? yjsState
      : output === 'text'
        ? taskDescriptionPlainText(decodeTaskDescriptionYjsState(yjsState))
        : output === 'json'
          ? decodeTaskDescriptionYjsState(yjsState)
          : taskDescriptionYjsStateToBase64(yjsState);

  writeOutput({ format: output, json, value });
}
