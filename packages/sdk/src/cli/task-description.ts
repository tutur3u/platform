import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { WorkspaceTaskDescriptionUpdatePayload } from '@tuturuuu/internal-api/tasks';
import {
  createTaskDescriptionPayload,
  normalizeTaskDescriptionContent,
  parsePersistedTaskDescriptionContent,
  parseTaskDescriptionInput,
  type TaskDescriptionInputFormat,
  type TaskDescriptionPayload,
  taskDescriptionPlainText,
  taskDescriptionYjsStateToBase64,
} from '@tuturuuu/utils/task-description-codec';
import { hasMeaningfulTaskDescriptionContent } from '@tuturuuu/utils/task-description-content';
import type { TuturuuuUserClient } from '../platform';
import { type FlagValue, getFlag } from './args';
import type { CliConfig } from './config';
import { render } from './render';
import { selectTaskId } from './selection';

const DIRECT_DESCRIPTION_TEXT_LIMIT = 180_000;
const DIRECT_DESCRIPTION_YJS_BASE64_LIMIT = 1_800_000;

const DESCRIPTION_ACTIONS = new Set([
  'append',
  'clear',
  'edit',
  'get',
  'prepend',
  'read',
  'set',
  'show',
  'write',
]);

type TaskDescriptionFormat = TaskDescriptionInputFormat;
type TaskDescriptionOutputFormat = 'json' | 'raw' | 'text' | 'yjs-base64';
type TaskDescriptionJsonContent = Parameters<
  typeof normalizeTaskDescriptionContent
>[0];

interface TaskDescriptionCommandOptions {
  client: TuturuuuUserClient;
  config: CliConfig;
  flags: Record<string, FlagValue>;
  json: boolean;
  positionals: string[];
  workspaceId: string;
}

function parseTaskDescriptionFormat(
  flags: Record<string, FlagValue>
): TaskDescriptionFormat {
  const format = (
    getFlag(flags, 'description-format') ||
    getFlag(flags, 'format') ||
    'text'
  ).toLowerCase();

  if (format === 'json' || format === 'markdown' || format === 'text') {
    return format;
  }

  throw new Error(`Unsupported task description format: ${format}`);
}

function parseTaskDescriptionOutputFormat(
  flags: Record<string, FlagValue>
): TaskDescriptionOutputFormat {
  const format = (getFlag(flags, 'format') || 'text').toLowerCase();

  if (
    format === 'json' ||
    format === 'raw' ||
    format === 'text' ||
    format === 'yjs-base64'
  ) {
    return format;
  }

  throw new Error(`Unsupported task description output format: ${format}`);
}

function toUpdatePayload(
  payload: TaskDescriptionPayload
): WorkspaceTaskDescriptionUpdatePayload {
  return {
    description: payload.description,
    description_yjs_state: payload.description_yjs_state,
  };
}

async function readStdin() {
  let content = '';
  for await (const chunk of process.stdin) {
    content += chunk;
  }
  return content;
}

async function readFileOrStdin(path: string) {
  return path === '-' ? readStdin() : readFile(path, 'utf8');
}

async function readDescriptionInput(
  flags: Record<string, FlagValue>,
  fallbackText?: string
) {
  const inlineText =
    getFlag(flags, 'description') ?? getFlag(flags, 'text') ?? fallbackText;
  if (inlineText !== undefined) {
    return inlineText;
  }

  const filePath = getFlag(flags, 'description-file') ?? getFlag(flags, 'file');
  if (filePath) {
    return readFileOrStdin(filePath);
  }
}

export async function getTaskDescriptionPayloadFromFlags(
  flags: Record<string, FlagValue>,
  fallbackText?: string
): Promise<WorkspaceTaskDescriptionUpdatePayload | null> {
  const input = await readDescriptionInput(flags, fallbackText);
  if (input === undefined) return null;

  const payload = createTaskDescriptionPayload(
    input,
    parseTaskDescriptionFormat(flags)
  );
  return toUpdatePayload(payload);
}

export function shouldUseChunkedTaskDescriptionUpdate(
  payload: WorkspaceTaskDescriptionUpdatePayload | null | undefined
) {
  if (!payload) return false;
  const descriptionLength = payload.description?.length ?? 0;
  const yjsBase64Length =
    taskDescriptionYjsStateToBase64(payload.description_yjs_state)?.length ?? 0;

  return (
    descriptionLength > DIRECT_DESCRIPTION_TEXT_LIMIT ||
    yjsBase64Length > DIRECT_DESCRIPTION_YJS_BASE64_LIMIT
  );
}

export async function updateTaskDescriptionWithBestTransport({
  client,
  payload,
  taskId,
  workspaceId,
}: {
  client: TuturuuuUserClient;
  payload: WorkspaceTaskDescriptionUpdatePayload;
  taskId: string;
  workspaceId: string;
}) {
  return shouldUseChunkedTaskDescriptionUpdate(payload)
    ? client.tasks.updateDescriptionChunked(workspaceId, taskId, payload)
    : client.tasks.updateDescription(workspaceId, taskId, payload);
}

function createPayloadFromContent(content: TaskDescriptionJsonContent) {
  const normalized = normalizeTaskDescriptionContent(content);
  if (!hasMeaningfulTaskDescriptionContent(normalized)) {
    return {
      description: null,
      description_yjs_state: null,
    };
  }

  return toUpdatePayload(
    createTaskDescriptionPayload(JSON.stringify(normalized), 'json')
  );
}

function mergeContent(
  current: TaskDescriptionJsonContent,
  next: TaskDescriptionJsonContent,
  position: 'append' | 'prepend'
) {
  const currentContent = current.content ?? [];
  const nextContent = next.content ?? [];

  return normalizeTaskDescriptionContent({
    content:
      position === 'append'
        ? [...currentContent, ...nextContent]
        : [...nextContent, ...currentContent],
    type: 'doc',
  });
}

function writeDescriptionOutput({
  format,
  json,
  response,
  taskId,
  value,
}: {
  format: TaskDescriptionOutputFormat;
  json: boolean;
  response: unknown;
  taskId: string;
  value: unknown;
}) {
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ format, task_id: taskId, value }, null, 2)}\n`
    );
    return;
  }

  if (format === 'raw') {
    render(response, { group: 'tasks', json: false });
    return;
  }

  process.stdout.write(`${String(value ?? '')}\n`);
}

function writeMutationOutput({
  action,
  json,
  response,
  taskId,
}: {
  action: string;
  json: boolean;
  response: unknown;
  taskId: string;
}) {
  if (json) {
    render(response, { group: 'tasks', json });
    return;
  }

  process.stdout.write(`${action} task description for ${taskId}.\n`);
}

async function editTaskDescription(initialText: string) {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new Error('Interactive editing requires a TTY.');
  }

  const editor = process.env.VISUAL || process.env.EDITOR;
  if (!editor) {
    throw new Error('Set VISUAL or EDITOR to use task description edit.');
  }

  const dir = await mkdtemp(join(tmpdir(), 'ttr-task-description-'));
  const file = join(dir, 'description.md');

  try {
    await writeFile(file, initialText, 'utf8');
    await new Promise<void>((resolve, reject) => {
      const child = spawn(editor, [file], {
        shell: true,
        stdio: 'inherit',
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else
          reject(new Error(`Editor exited with status ${code ?? 'unknown'}`));
      });
    });
    return readFile(file, 'utf8');
  } finally {
    await rm(dir, { force: true, recursive: true }).catch(() => undefined);
  }
}

function resolveDescriptionAction(positionals: string[]) {
  const rawAction = positionals[2];
  const rawTaskId = positionals[3];
  const action =
    rawAction && DESCRIPTION_ACTIONS.has(rawAction) ? rawAction : 'get';
  const taskId =
    action === 'get' && rawAction !== 'get' ? rawAction : rawTaskId;
  const textStartIndex = action === 'get' && rawAction !== 'get' ? 3 : 4;
  const trailingText = positionals.slice(textStartIndex).join(' ').trim();

  return {
    action:
      action === 'read' || action === 'show'
        ? 'get'
        : action === 'write'
          ? 'set'
          : action,
    taskId,
    trailingText: trailingText || undefined,
  };
}

export async function runTaskDescriptionCommand({
  client,
  config,
  flags,
  json,
  positionals,
  workspaceId,
}: TaskDescriptionCommandOptions): Promise<CliConfig> {
  const {
    action,
    taskId: explicitTaskId,
    trailingText,
  } = resolveDescriptionAction(positionals);
  const selection = await selectTaskId(
    client,
    config,
    workspaceId,
    flags,
    json,
    explicitTaskId || getFlag(flags, 'task')
  );
  const nextConfig = selection.config;

  if (action === 'get') {
    const current = await client.tasks.getDescription(
      workspaceId,
      selection.taskId
    );
    const format = parseTaskDescriptionOutputFormat(flags);
    const content = parsePersistedTaskDescriptionContent(current);
    const value =
      format === 'json'
        ? content
        : format === 'yjs-base64'
          ? taskDescriptionYjsStateToBase64(current.description_yjs_state)
          : format === 'raw'
            ? current
            : taskDescriptionPlainText(content);

    writeDescriptionOutput({
      format,
      json,
      response: current,
      taskId: selection.taskId,
      value,
    });
    return nextConfig;
  }

  if (action === 'clear') {
    const response = await updateTaskDescriptionWithBestTransport({
      client,
      payload: { description: null, description_yjs_state: null },
      taskId: selection.taskId,
      workspaceId,
    });
    writeMutationOutput({
      action: 'Cleared',
      json,
      response,
      taskId: selection.taskId,
    });
    return nextConfig;
  }

  if (action === 'edit') {
    const current = await client.tasks.getDescription(
      workspaceId,
      selection.taskId
    );
    const currentContent = parsePersistedTaskDescriptionContent(current);
    const edited = await editTaskDescription(
      taskDescriptionPlainText(currentContent)
    );
    const payload = toUpdatePayload(
      createTaskDescriptionPayload(edited, 'markdown')
    );
    const response = await updateTaskDescriptionWithBestTransport({
      client,
      payload,
      taskId: selection.taskId,
      workspaceId,
    });
    writeMutationOutput({
      action: 'Updated',
      json,
      response,
      taskId: selection.taskId,
    });
    return nextConfig;
  }

  const input = await readDescriptionInput(flags, trailingText);
  if (input === undefined && action !== 'clear') {
    throw new Error(
      'Missing description input. Use --text, --description, --file, --description-file, or stdin with --file -.'
    );
  }

  if (action === 'set') {
    const payload = toUpdatePayload(
      createTaskDescriptionPayload(
        input ?? '',
        parseTaskDescriptionFormat(flags)
      )
    );
    const response = await updateTaskDescriptionWithBestTransport({
      client,
      payload,
      taskId: selection.taskId,
      workspaceId,
    });
    writeMutationOutput({
      action: 'Updated',
      json,
      response,
      taskId: selection.taskId,
    });
    return nextConfig;
  }

  if (action === 'append' || action === 'prepend') {
    const format = parseTaskDescriptionFormat(flags);
    const current = await client.tasks.getDescription(
      workspaceId,
      selection.taskId
    );
    const currentContent = parsePersistedTaskDescriptionContent(current);
    const nextContent = parseTaskDescriptionInput(input ?? '', format);
    const payload = createPayloadFromContent(
      mergeContent(currentContent, nextContent, action)
    );
    const response = await updateTaskDescriptionWithBestTransport({
      client,
      payload,
      taskId: selection.taskId,
      workspaceId,
    });
    writeMutationOutput({
      action: action === 'append' ? 'Appended' : 'Prepended',
      json,
      response,
      taskId: selection.taskId,
    });
    return nextConfig;
  }

  throw new Error(`Unknown task description action: ${action}`);
}
