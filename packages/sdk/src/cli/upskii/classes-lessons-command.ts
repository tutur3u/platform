import { type FlagValue, getFlag, parseArgs } from '../args';
import { CLI_EXIT, CliError } from '../cli-contracts';
import type { CliEnv } from '../cli-env';
import { requireMutationGate } from '../safety-gate';
import { formatTable } from '../ui/table';
import type { UpskiiProductClient } from './product-client';

export interface UpskiiClassesLessonsOptions {
  args: string[];
  client: UpskiiProductClient;
  env: CliEnv;
  explicitEnvFlag?: boolean;
  json: boolean;
  noColor?: boolean;
  write?: (chunk: string) => void;
}

const LESSON_SEED_TEMPLATES = {
  basic: [
    {
      content: 'Core concept overview for automated QA verification.',
      kind: 'theory',
      title: 'Lesson 1 — Core Concepts',
    },
  ],
  'edufest-workshop': [
    {
      content:
        'Workshop kickoff: learning goals, agenda, and classroom collaboration walkthrough.',
      kind: 'objective',
      title: 'Workshop Kickoff & Goals',
    },
    {
      content:
        'Interactive theory module covering AI-assisted teaching workflows and guided practice.',
      kind: 'theory',
      title: 'AI-Assisted Classroom Practice',
    },
    {
      content:
        'Hands-on worked example prepared for EduFest Workshop E2E verification.',
      kind: 'example',
      title: 'Guided Workshop Exercise',
    },
  ],
  'qa-smoke': [
    {
      content: 'Minimal deterministic QA smoke lesson payload.',
      kind: 'theory',
      title: 'QA Smoke Lesson',
    },
  ],
} as const;

type SeedTemplateName = keyof typeof LESSON_SEED_TEMPLATES;

const RUN_LABEL = /^[a-z0-9][a-z0-9-]{3,30}$/u;

function tagWithRunMarker(title: string, runLabel?: string): string {
  if (!runLabel) return title;
  if (!RUN_LABEL.test(runLabel)) {
    throw new CliError({
      code: 'INVALID_RUN_LABEL',
      exitCode: CLI_EXIT.usage,
      message:
        'Invalid --run label. Use 4–31 lowercase alphanumeric characters and hyphens.',
    });
  }
  return `[QA-E2E ${runLabel}] ${title}`.slice(0, 120);
}

function requiredFlag(flags: Record<string, FlagValue>, key: string): string {
  const value = getFlag(flags, key)?.trim();
  if (!value) {
    throw new CliError({
      code: 'MISSING_FLAG',
      exitCode: CLI_EXIT.usage,
      message: `Missing required flag --${key}.`,
    });
  }
  return value;
}

export function upskiiClassesHelp(): string {
  return [
    'ttr external upskii classes — inspect and manage Upskii classes',
    '',
    'Usage:',
    '  ttr external upskii classes list [--experience educator|learn] [--qa-only] [--session-file <path>] [--json]',
    '  ttr external upskii classes get <classId> [--json]',
    '  ttr external upskii classes overview <classId> [--json]',
    '  ttr external upskii classes create --name <title> [--subject <subject>] [--run <label>] [--yes] [--json]',
    '  ttr external upskii classes join --code <joinCode> [--yes] [--json]',
    '  ttr external upskii classes join-code <classId> [--json]',
    '',
    'Mutations preview a diff unless --yes is passed.',
  ].join('\n');
}

export function upskiiLessonsHelp(): string {
  return [
    'ttr external upskii lessons — inspect, create, seed, and publish Upskii lessons',
    '',
    'Usage:',
    '  ttr external upskii lessons list --class <classId> [--json]',
    '  ttr external upskii lessons get <lessonId> [--json]',
    '  ttr external upskii lessons modules --lesson <lessonDraftId> [--json]',
    '  ttr external upskii lessons create --class <classId> --title <title> [--kind theory|objective|example|quiz|homework] [--content <text>] [--run <label>] [--publish] [--yes] [--json]',
    '  ttr external upskii lessons seed --class <classId> [--template edufest-workshop|basic|qa-smoke] [--run <label>] [--no-publish] [--yes] [--json]',
    '  ttr external upskii lessons publish <lessonDraftId> [--yes] [--json]',
    '  ttr external upskii lessons unpublish <lessonDraftId> [--yes] [--json]',
  ].join('\n');
}

export async function runUpskiiClassesCommand(
  options: UpskiiClassesLessonsOptions
): Promise<void> {
  const write =
    options.write ?? ((chunk: string) => process.stdout.write(chunk));
  const { flags, positionals } = parseArgs(options.args);
  const [action = 'list', id] = positionals;

  if (action === 'help' || flags.help === true || flags.h === true) {
    write(`${upskiiClassesHelp()}\n`);
    return;
  }

  const { client, env, json, noColor } = options;

  if (action === 'list' || action === 'ls') {
    const res = await client.requestJson<{
      classes?: Array<Record<string, unknown>>;
    }>({
      command: 'external.upskii.classes.list',
      path: `${client.apiBase}/classes`,
    });
    let classes = Array.isArray(res.data.classes) ? res.data.classes : [];
    if (flags['qa-only'] === true) {
      classes = classes.filter(
        (entry) =>
          typeof entry.title === 'string' && entry.title.startsWith('[QA-E2E ')
      );
    }
    if (json) {
      write(
        `${JSON.stringify({ classes, count: classes.length, d1Telemetry: res.d1Telemetry }, null, 2)}\n`
      );
      return;
    }
    write(
      formatTable(
        classes.map((entry) => ({
          Id: String(entry.id ?? ''),
          Subject: String(entry.subject ?? ''),
          Title: String(entry.title ?? ''),
          Visibility: String(entry.visibility ?? ''),
        })),
        { emptyMessage: 'No classes found.', noColor }
      )
    );
    return;
  }

  if (action === 'get' || action === 'show') {
    if (!id) {
      throw new CliError({
        code: 'MISSING_CLASS_ID',
        exitCode: CLI_EXIT.usage,
        message:
          'Pass a class ID: `ttr external upskii classes get <classId>`.',
      });
    }
    const res = await client.requestJson<Record<string, unknown>>({
      command: 'external.upskii.classes.get',
      path: `${client.apiBase}/classes/${encodeURIComponent(id)}`,
    });
    write(`${JSON.stringify(res.data, null, 2)}\n`);
    return;
  }

  if (action === 'overview') {
    if (!id) {
      throw new CliError({
        code: 'MISSING_CLASS_ID',
        exitCode: CLI_EXIT.usage,
        message:
          'Pass a class ID: `ttr external upskii classes overview <classId>`.',
      });
    }
    const res = await client.requestJson<Record<string, unknown>>({
      command: 'external.upskii.classes.overview',
      path: `${client.apiBase}/classes/${encodeURIComponent(id)}/overview`,
    });
    write(`${JSON.stringify(res.data, null, 2)}\n`);
    return;
  }

  if (action === 'join-code') {
    if (!id) {
      throw new CliError({
        code: 'MISSING_CLASS_ID',
        exitCode: CLI_EXIT.usage,
        message:
          'Pass a class ID: `ttr external upskii classes join-code <classId>`.',
      });
    }
    const res = await client.requestJson<Record<string, unknown>>({
      command: 'external.upskii.classes.join-code',
      path: `${client.apiBase}/classes/join-code?classId=${encodeURIComponent(id)}`,
    });
    write(`${JSON.stringify(res.data, null, 2)}\n`);
    return;
  }

  if (action === 'create') {
    const rawName = getFlag(flags, 'name') ?? getFlag(flags, 'title');
    if (!rawName?.trim()) {
      throw new CliError({
        code: 'MISSING_FLAG',
        exitCode: CLI_EXIT.usage,
        message: 'Missing --name <title> for class creation.',
      });
    }
    const runLabel = getFlag(flags, 'run');
    const title = tagWithRunMarker(rawName.trim(), runLabel);
    const subject = getFlag(flags, 'subject') ?? 'general';
    const description = getFlag(flags, 'description') ?? '';
    const visibility = getFlag(flags, 'visibility') ?? 'private';

    const gate = await requireMutationGate({
      explicitEnvFlag: options.explicitEnvFlag,
      flags,
      json,
      noColor,
      preview: {
        applyHint: `ttr external upskii classes create --env ${env} --name ${JSON.stringify(rawName.trim())}${runLabel ? ` --run ${runLabel}` : ''} --yes`,
        changes: [
          { after: title, field: 'title' },
          { after: subject, field: 'subject' },
          { after: visibility, field: 'visibility' },
        ],
        env,
        origin: client.origins.app,
        target: runLabel ? `class:${runLabel}` : 'class:new',
        tier: 1,
        title: 'Create Upskii class',
      },
      write,
    });
    if (!gate.applied) return;

    const res = await client.requestJson<Record<string, unknown>>({
      body: {
        approvalMode: 'auto',
        description,
        subject,
        title,
        visibility,
      },
      command: 'external.upskii.classes.create',
      method: 'POST',
      path: `${client.apiBase}/classes`,
      reason: gate.reason,
    });
    write(`${JSON.stringify(res.data, null, 2)}\n`);
    return;
  }

  if (action === 'join') {
    const code = requiredFlag(flags, 'code');
    const gate = await requireMutationGate({
      explicitEnvFlag: options.explicitEnvFlag,
      flags,
      json,
      noColor,
      preview: {
        applyHint: `ttr external upskii classes join --env ${env} --code <joinCode> --yes`,
        changes: [{ after: '***', field: 'joinCode' }],
        env,
        origin: client.origins.app,
        target: 'class-join',
        tier: 1,
        title: 'Join Upskii class by code',
      },
      write,
    });
    if (!gate.applied) return;

    const res = await client.requestJson<Record<string, unknown>>({
      body: { code },
      command: 'external.upskii.classes.join',
      method: 'POST',
      path: '/workspace/learn/api/upskii/classes/join',
      reason: gate.reason,
    });
    write(`${JSON.stringify(res.data, null, 2)}\n`);
    return;
  }

  throw new CliError({
    code: 'UNKNOWN_CLASSES_ACTION',
    exitCode: CLI_EXIT.usage,
    hint: 'Run `ttr external upskii classes --help`.',
    message: `Unknown classes action "${action}".`,
  });
}

export async function runUpskiiLessonsCommand(
  options: UpskiiClassesLessonsOptions
): Promise<void> {
  const write =
    options.write ?? ((chunk: string) => process.stdout.write(chunk));
  const { flags, positionals } = parseArgs(options.args);
  const [action = 'list', id] = positionals;

  if (action === 'help' || flags.help === true || flags.h === true) {
    write(`${upskiiLessonsHelp()}\n`);
    return;
  }

  const { client, env, json, noColor } = options;

  if (action === 'list' || action === 'ls') {
    const classId = requiredFlag(flags, 'class');
    const res = await client.requestJson<{
      class?: { lessons?: Array<Record<string, unknown>> };
      lessons?: Array<Record<string, unknown>>;
    }>({
      command: 'external.upskii.lessons.list',
      path: `${client.apiBase}/classes/${encodeURIComponent(classId)}/overview`,
    });
    const lessons = res.data.lessons ?? res.data.class?.lessons ?? [];
    if (json) {
      write(
        `${JSON.stringify({ classId, count: lessons.length, lessons }, null, 2)}\n`
      );
      return;
    }
    write(
      formatTable(
        lessons.map((entry) => ({
          Id: String(entry.id ?? ''),
          Status: String(
            (entry.status ?? entry.published) ? 'published' : 'draft'
          ),
          Title: String(entry.title ?? ''),
        })),
        { emptyMessage: 'No lessons found in class.', noColor }
      )
    );
    return;
  }

  if (action === 'get' || action === 'show') {
    if (!id) {
      throw new CliError({
        code: 'MISSING_LESSON_ID',
        exitCode: CLI_EXIT.usage,
        message:
          'Pass a lesson ID: `ttr external upskii lessons get <lessonId>`.',
      });
    }
    const res = await client.requestJson<Record<string, unknown>>({
      command: 'external.upskii.lessons.get',
      path: `${client.apiBase}/lessons/${encodeURIComponent(id)}`,
    });
    write(`${JSON.stringify(res.data, null, 2)}\n`);
    return;
  }

  if (action === 'modules') {
    const lessonDraftId = getFlag(flags, 'lesson') ?? id;
    if (!lessonDraftId) {
      throw new CliError({
        code: 'MISSING_LESSON_ID',
        exitCode: CLI_EXIT.usage,
        message: 'Pass --lesson <lessonDraftId>.',
      });
    }
    const res = await client.requestJson<{
      modules?: Array<Record<string, unknown>>;
    }>({
      command: 'external.upskii.lessons.modules',
      path: `${client.apiBase}/lessons/modules?lessonDraftId=${encodeURIComponent(lessonDraftId)}`,
    });
    if (json) {
      write(`${JSON.stringify(res.data, null, 2)}\n`);
      return;
    }
    write(
      formatTable(
        (res.data.modules ?? []).map((mod) => ({
          Id: String(mod.id ?? ''),
          Kind: String(mod.kind ?? ''),
          Status: String(mod.status ?? ''),
          Title: String(mod.title ?? ''),
        })),
        { emptyMessage: 'No lesson modules found.', noColor }
      )
    );
    return;
  }

  if (action === 'create') {
    const classId = requiredFlag(flags, 'class');
    const rawTitle = requiredFlag(flags, 'title');
    const runLabel = getFlag(flags, 'run');
    const title = tagWithRunMarker(rawTitle, runLabel);
    const kind = getFlag(flags, 'kind') ?? 'theory';
    const content =
      getFlag(flags, 'content') ?? `${title} — generated by ttr CLI.`;
    const shouldPublish = flags.publish === true;

    const gate = await requireMutationGate({
      explicitEnvFlag: options.explicitEnvFlag,
      flags,
      json,
      noColor,
      preview: {
        applyHint: `ttr external upskii lessons create --env ${env} --class ${classId} --title ${JSON.stringify(rawTitle)}${runLabel ? ` --run ${runLabel}` : ''}${shouldPublish ? ' --publish' : ''} --yes`,
        changes: [
          { after: classId, field: 'classId' },
          { after: title, field: 'title' },
          { after: kind, field: 'kind' },
          { after: shouldPublish, field: 'publish' },
        ],
        env,
        origin: client.origins.app,
        target: runLabel ? `lesson:${runLabel}` : `lesson:${classId}`,
        tier: 1,
        title: 'Create Upskii manual lesson draft',
      },
      write,
    });
    if (!gate.applied) return;

    const created = await client.requestJson<{
      lesson?: { id?: string; [key: string]: unknown };
    }>({
      body: {
        classId,
        content,
        curriculum: getFlag(flags, 'curriculum') ?? 'GDPT 2018',
        description: getFlag(flags, 'description') ?? undefined,
        kind,
        title,
      },
      command: 'external.upskii.lessons.create',
      method: 'POST',
      path: `${client.apiBase}/lessons/manual`,
      reason: gate.reason,
    });

    let published: unknown;
    const lessonId = created.data.lesson?.id;
    if (shouldPublish && typeof lessonId === 'string' && lessonId) {
      const pubRes = await client.requestJson<Record<string, unknown>>({
        body: { lessonDraftId: lessonId },
        command: 'external.upskii.lessons.publish',
        method: 'POST',
        path: `${client.apiBase}/lessons/publish`,
        reason: gate.reason,
      });
      published = pubRes.data;
    }

    write(
      `${JSON.stringify({ created: created.data, published: published ?? null }, null, 2)}\n`
    );
    return;
  }

  if (action === 'seed') {
    const classId = requiredFlag(flags, 'class');
    const templateName = (getFlag(flags, 'template') ??
      'edufest-workshop') as SeedTemplateName;
    const specs = LESSON_SEED_TEMPLATES[templateName];
    if (!specs) {
      throw new CliError({
        code: 'INVALID_TEMPLATE',
        exitCode: CLI_EXIT.usage,
        message: `Unknown lesson seed template "${templateName}". Use edufest-workshop, basic, or qa-smoke.`,
      });
    }
    const runLabel = getFlag(flags, 'run');
    const shouldPublish = flags['no-publish'] !== true;

    const plannedTitles = specs.map((spec) =>
      tagWithRunMarker(spec.title, runLabel)
    );
    const gate = await requireMutationGate({
      explicitEnvFlag: options.explicitEnvFlag,
      flags,
      json,
      noColor,
      preview: {
        applyHint: `ttr external upskii lessons seed --env ${env} --class ${classId} --template ${templateName}${runLabel ? ` --run ${runLabel}` : ''} --yes`,
        changes: plannedTitles.map((title, idx) => ({
          after: `${specs[idx]!.kind}: ${title}`,
          field: `lesson[${idx}]`,
        })),
        env,
        origin: client.origins.app,
        target: runLabel ? `lesson-seed:${runLabel}` : `lesson-seed:${classId}`,
        tier: 1,
        title: `Seed ${specs.length} Upskii lesson(s) (${templateName})`,
      },
      write,
    });
    if (!gate.applied) return;

    const seeded: Array<{
      id: string | null;
      kind: string;
      published: boolean;
      title: string;
    }> = [];
    for (let i = 0; i < specs.length; i += 1) {
      const spec = specs[i]!;
      const title = plannedTitles[i]!;
      const created = await client.requestJson<{ lesson?: { id?: string } }>({
        body: {
          classId,
          content: spec.content,
          curriculum: 'GDPT 2018',
          kind: spec.kind,
          title,
        },
        command: 'external.upskii.lessons.seed',
        method: 'POST',
        path: `${client.apiBase}/lessons/manual`,
        reason: gate.reason,
      });
      const lessonId = created.data.lesson?.id ?? null;
      let isPublished = false;
      if (shouldPublish && lessonId) {
        await client.requestJson({
          body: { lessonDraftId: lessonId },
          command: 'external.upskii.lessons.publish',
          method: 'POST',
          path: `${client.apiBase}/lessons/publish`,
          reason: gate.reason,
        });
        isPublished = true;
      }
      seeded.push({
        id: lessonId,
        kind: spec.kind,
        published: isPublished,
        title,
      });
    }

    if (json) {
      write(
        `${JSON.stringify({ classId, count: seeded.length, lessons: seeded, template: templateName }, null, 2)}\n`
      );
      return;
    }
    write(
      formatTable(
        seeded.map((item) => ({
          Id: item.id ?? '',
          Kind: item.kind,
          Published: item.published ? 'yes' : 'no',
          Title: item.title,
        })),
        { noColor }
      )
    );
    return;
  }

  if (action === 'publish' || action === 'unpublish') {
    const lessonDraftId = id ?? getFlag(flags, 'lesson');
    if (!lessonDraftId) {
      throw new CliError({
        code: 'MISSING_LESSON_ID',
        exitCode: CLI_EXIT.usage,
        message: `Pass a lesson ID: \`ttr external upskii lessons ${action} <lessonDraftId>\`.`,
      });
    }
    const gate = await requireMutationGate({
      explicitEnvFlag: options.explicitEnvFlag,
      flags,
      json,
      noColor,
      preview: {
        applyHint: `ttr external upskii lessons ${action} ${lessonDraftId} --env ${env} --yes`,
        changes: [
          {
            after: action === 'publish' ? 'published' : 'draft',
            field: 'status',
          },
        ],
        env,
        origin: client.origins.app,
        target: `lesson:${lessonDraftId}`,
        tier: 1,
        title: `${action === 'publish' ? 'Publish' : 'Unpublish'} Upskii lesson`,
      },
      write,
    });
    if (!gate.applied) return;

    const res = await client.requestJson<Record<string, unknown>>({
      body: { lessonDraftId },
      command: `external.upskii.lessons.${action}`,
      method: 'POST',
      path: `${client.apiBase}/lessons/${action}`,
      reason: gate.reason,
    });
    write(`${JSON.stringify(res.data, null, 2)}\n`);
    return;
  }

  throw new CliError({
    code: 'UNKNOWN_LESSONS_ACTION',
    exitCode: CLI_EXIT.usage,
    hint: 'Run `ttr external upskii lessons --help`.',
    message: `Unknown lessons action "${action}".`,
  });
}
