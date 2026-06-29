import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type {
  WorkspaceTaskTemplate,
  WorkspaceTaskTemplatePayload,
} from '../task-templates';

const LOCAL_TEMPLATE_DIR = join('.tuturuuu', 'task-templates');

type Frontmatter = Record<string, unknown>;

export interface LocalTaskTemplate {
  path: string;
  payload: WorkspaceTaskTemplatePayload;
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asNullableString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const text = asString(entry);
      return text ? [text] : [];
    });
  }

  const text = asString(value);
  return text
    ? text
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : undefined;
}

function asPriority(value: unknown) {
  const text = asString(value);
  return ['critical', 'high', 'normal', 'low'].includes(text ?? '')
    ? (text as WorkspaceTaskTemplatePayload['priority'])
    : undefined;
}

function asVisibility(value: unknown) {
  const text = asString(value);
  return text === 'workspace' ? 'workspace' : 'private';
}

function asEstimationPoints(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  const text = asString(value);
  if (!text) return undefined;
  const parsed = Number.parseInt(text, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function splitFrontmatter(source: string) {
  if (!source.startsWith('---\n')) {
    return { body: source, frontmatter: {} as Frontmatter };
  }

  const closeIndex = source.indexOf('\n---', 4);
  if (closeIndex === -1) {
    throw new Error('Local task template frontmatter is missing a closing ---');
  }

  const frontmatterSource = source.slice(4, closeIndex);
  const body = source.slice(closeIndex + 4).replace(/^\r?\n/u, '');
  const parsed = parseYaml(frontmatterSource);

  if (
    parsed !== null &&
    (typeof parsed !== 'object' || Array.isArray(parsed))
  ) {
    throw new Error('Local task template frontmatter must be a YAML object');
  }

  return {
    body,
    frontmatter: (parsed ?? {}) as Frontmatter,
  };
}

function inferKeyFromPath(path: string) {
  return basename(path).replace(/\.md$/iu, '');
}

export function parseLocalTaskTemplateFile(path: string): LocalTaskTemplate {
  const absolutePath = resolve(path);
  const source = readFileSync(absolutePath, 'utf8');
  const { body, frontmatter } = splitFrontmatter(source);
  const name =
    asString(frontmatter.name) ??
    asString(frontmatter.template_name) ??
    asString(frontmatter.title) ??
    inferKeyFromPath(absolutePath);
  const taskName =
    asString(frontmatter.task_name) ??
    asString(frontmatter.taskTitle) ??
    asString(frontmatter.title) ??
    name;

  return {
    path: absolutePath,
    payload: {
      assignee_ids:
        asStringArray(frontmatter.assignee_ids) ??
        asStringArray(frontmatter.assignees) ??
        [],
      default_board_id:
        asString(frontmatter.default_board_id) ??
        asString(frontmatter.board_id) ??
        undefined,
      default_list_id:
        asString(frontmatter.default_list_id) ??
        asString(frontmatter.list_id) ??
        undefined,
      description:
        body.trim() || asNullableString(frontmatter.description) || null,
      end_date: asString(frontmatter.end_date) ?? null,
      estimation_points:
        asEstimationPoints(frontmatter.estimation_points) ?? null,
      key:
        asString(frontmatter.key) ??
        asString(frontmatter.slug) ??
        inferKeyFromPath(absolutePath),
      label_ids:
        asStringArray(frontmatter.label_ids) ??
        asStringArray(frontmatter.labels) ??
        [],
      name,
      priority: asPriority(frontmatter.priority) ?? null,
      project_ids:
        asStringArray(frontmatter.project_ids) ??
        asStringArray(frontmatter.projects) ??
        [],
      start_date: asString(frontmatter.start_date) ?? null,
      task_name: taskName,
      visibility: asVisibility(frontmatter.visibility),
    },
  };
}

export function isLocalTaskTemplateReference(reference: string) {
  return (
    reference.endsWith('.md') ||
    reference.includes('/') ||
    reference.includes('\\') ||
    existsSync(resolve(reference))
  );
}

export function resolveLocalTaskTemplatePath(
  reference: string,
  cwd = process.cwd()
) {
  const directPath = isAbsolute(reference)
    ? reference
    : resolve(cwd, reference);
  if (existsSync(directPath)) return directPath;

  const filename = reference.endsWith('.md') ? reference : `${reference}.md`;
  return resolve(cwd, LOCAL_TEMPLATE_DIR, filename);
}

export function listLocalTaskTemplates(cwd = process.cwd()) {
  const directory = resolve(cwd, LOCAL_TEMPLATE_DIR);
  if (!existsSync(directory)) return [];

  return readdirSync(directory)
    .filter((entry) => entry.endsWith('.md'))
    .sort((a, b) => a.localeCompare(b))
    .map((entry) => parseLocalTaskTemplateFile(join(directory, entry)));
}

export function taskTemplateToMarkdown(
  template: WorkspaceTaskTemplate | WorkspaceTaskTemplatePayload
) {
  const frontmatter = {
    key: 'slug' in template ? template.slug : template.key,
    name: template.name,
    task_name: template.task_name,
    visibility: template.visibility ?? 'private',
    default_board_id: template.default_board_id ?? undefined,
    default_list_id: template.default_list_id ?? undefined,
    priority: template.priority ?? undefined,
    start_date: template.start_date ?? undefined,
    end_date: template.end_date ?? undefined,
    estimation_points: template.estimation_points ?? undefined,
    label_ids: template.label_ids?.length ? template.label_ids : undefined,
    assignee_ids: template.assignee_ids?.length
      ? template.assignee_ids
      : undefined,
    project_ids: template.project_ids?.length
      ? template.project_ids
      : undefined,
  };

  return `---\n${stringifyYaml(frontmatter).trim()}\n---\n\n${template.description ?? ''}\n`;
}

export function writeLocalTaskTemplate(
  path: string,
  template: WorkspaceTaskTemplate | WorkspaceTaskTemplatePayload
) {
  const absolutePath = resolve(path);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, taskTemplateToMarkdown(template), 'utf8');
  return absolutePath;
}
