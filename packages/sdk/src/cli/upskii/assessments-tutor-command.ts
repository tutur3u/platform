import { type FlagValue, getFlag, parseArgs } from '../args';
import { CLI_EXIT, CliError } from '../cli-contracts';
import type { CliEnv } from '../cli-env';
import { rejectSecretFlags } from '../credential-store';
import { requireMutationGate } from '../safety-gate';
import { formatTable } from '../ui/table';
import { formatQaMarker } from './http';
import {
  rethrowUnavailableEndpoint,
  type UpskiiProductClient,
} from './product-client';

export interface UpskiiAssessmentsTutorOptions {
  args: string[];
  client: UpskiiProductClient;
  env: CliEnv;
  explicitEnvFlag?: boolean;
  json: boolean;
  noColor?: boolean;
  write?: (chunk: string) => void;
}

const VALID_ASSESSMENT_TYPES = new Set(['assignment', 'quiz']);

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

export function upskiiAssessmentsHelp(): string {
  return [
    'ttr external upskii assessments — inspect, create, and publish Upskii assessments',
    '',
    'Usage:',
    '  ttr external upskii assessments list --class <classId> [--json]',
    '  ttr external upskii assessments get <id> [--json]',
    '  ttr external upskii assessments submissions <id> [--json]',
    '  ttr external upskii assessments create --class <classId> --title <title> [--type quiz|assignment] [--run <label>] [--yes] [--json]',
    '  ttr external upskii assessments publish <id> [--yes] [--json]',
    '',
    'Mutations preview a diff unless --yes is passed (and --dry-run always previews).',
  ].join('\n');
}

export function upskiiTutorHelp(): string {
  return [
    'ttr external upskii tutor — inspect Upskii tutor sessions, prompts, and run bounded smokes',
    '',
    'Usage:',
    '  ttr external upskii tutor sessions list [--class <classId>] [--json]',
    '  ttr external upskii tutor get <sessionId> [--json]',
    '  ttr external upskii tutor prompts list [--json]',
    '  ttr external upskii tutor smoke --class <classId> [--prompt <text>] [--max-latency-ms 20000] [--expect-stream] [--yes] [--json]',
    '',
    'Tutor smoke previews unless --yes is passed (and --dry-run always previews).',
  ].join('\n');
}

export async function runUpskiiAssessmentsCommand(
  options: UpskiiAssessmentsTutorOptions
): Promise<void> {
  const write =
    options.write ?? ((chunk: string) => process.stdout.write(chunk));
  const { flags, positionals } = parseArgs(options.args);
  const [action = 'list', id] = positionals;

  if (action === 'help' || flags.help === true || flags.h === true) {
    write(`${upskiiAssessmentsHelp()}\n`);
    return;
  }

  rejectSecretFlags(flags);
  const { client, env, json, noColor } = options;

  if (action === 'list' || action === 'ls') {
    const classId = requiredFlag(flags, 'class');
    const res = await client.requestJson<{
      assessments?: Array<Record<string, unknown>>;
      items?: Array<Record<string, unknown>>;
    }>({
      command: 'external.upskii.assessments.list',
      path: `${client.apiBase}/assessments?classId=${encodeURIComponent(classId)}`,
    });
    const assessments = Array.isArray(res.data.assessments)
      ? res.data.assessments
      : Array.isArray(res.data.items)
        ? res.data.items
        : [];
    if (json) {
      write(
        `${JSON.stringify({ assessments, classId, count: assessments.length, d1Telemetry: res.d1Telemetry, env }, null, 2)}\n`
      );
      return;
    }
    write(
      formatTable(
        assessments.map((entry) => ({
          Id: String(entry.id ?? ''),
          Status: String(entry.status ?? ''),
          Title: String(entry.title ?? ''),
          Type: String(entry.type ?? ''),
        })),
        { emptyMessage: 'No assessments found.', noColor }
      )
    );
    return;
  }

  if (action === 'get' || action === 'show') {
    const assessmentId = id ?? getFlag(flags, 'id');
    if (!assessmentId) {
      throw new CliError({
        code: 'MISSING_ASSESSMENT_ID',
        exitCode: CLI_EXIT.usage,
        message:
          'Pass an assessment ID: `ttr external upskii assessments get <id>`.',
      });
    }
    const res = await client.requestJson<Record<string, unknown>>({
      command: 'external.upskii.assessments.get',
      path: `${client.apiBase}/assessments/${encodeURIComponent(assessmentId)}`,
    });
    write(`${JSON.stringify(res.data, null, 2)}\n`);
    return;
  }

  if (action === 'submissions') {
    const assessmentId = id ?? getFlag(flags, 'id');
    if (!assessmentId) {
      throw new CliError({
        code: 'MISSING_ASSESSMENT_ID',
        exitCode: CLI_EXIT.usage,
        message:
          'Pass an assessment ID: `ttr external upskii assessments submissions <id>`.',
      });
    }
    const res = await client.requestJson<{
      attempts?: Array<Record<string, unknown>>;
      items?: Array<Record<string, unknown>>;
      submissions?: Array<Record<string, unknown>>;
    }>({
      command: 'external.upskii.assessments.submissions',
      path: `${client.apiBase}/assessments/${encodeURIComponent(assessmentId)}/submissions`,
    });
    const submissions = Array.isArray(res.data.submissions)
      ? res.data.submissions
      : Array.isArray(res.data.attempts)
        ? res.data.attempts
        : Array.isArray(res.data.items)
          ? res.data.items
          : [];
    if (json) {
      write(
        `${JSON.stringify({ assessmentId, count: submissions.length, d1Telemetry: res.d1Telemetry, env, submissions }, null, 2)}\n`
      );
      return;
    }
    write(
      formatTable(
        submissions.map((item) => ({
          Id: String(item.id ?? ''),
          Score: String(item.score ?? ''),
          Status: String(item.status ?? ''),
          Student: String(item.studentId ?? item.userId ?? item.student ?? ''),
        })),
        { emptyMessage: 'No submissions found.', noColor }
      )
    );
    return;
  }

  if (action === 'create') {
    const classId = requiredFlag(flags, 'class');
    const rawTitle = requiredFlag(flags, 'title');
    const runLabel = getFlag(flags, 'run');
    const title = runLabel ? formatQaMarker(runLabel, rawTitle) : rawTitle;
    const type = (getFlag(flags, 'type') ?? 'quiz').toLowerCase();
    if (!VALID_ASSESSMENT_TYPES.has(type)) {
      throw new CliError({
        code: 'INVALID_ASSESSMENT_TYPE',
        exitCode: CLI_EXIT.usage,
        message: `Invalid --type "${type}". Use quiz or assignment.`,
      });
    }
    const description = getFlag(flags, 'description');

    const gate = await requireMutationGate({
      explicitEnvFlag: options.explicitEnvFlag,
      flags,
      json,
      noColor,
      preview: {
        applyHint: `ttr external upskii assessments create --env ${env} --class ${classId} --title ${JSON.stringify(rawTitle)} --type ${type}${env === 'prod' ? ' --reason "<reason>"' : ''} --yes`,
        changes: [
          { after: classId, field: 'classId' },
          { after: title, field: 'title' },
          { after: type, field: 'type' },
        ],
        env,
        origin: client.origins.app,
        target: `assessment:${classId}`,
        tier: 1,
        title: 'Create Upskii assessment',
      },
      write,
    });
    if (!gate.applied) return;

    const res = await client.requestJson<Record<string, unknown>>({
      body: {
        classId,
        ...(description ? { description } : {}),
        title,
        type,
      },
      command: 'external.upskii.assessments.create',
      method: 'POST',
      path: `${client.apiBase}/assessments`,
      reason: gate.reason,
    });
    write(
      `${JSON.stringify({ applied: true, assessment: res.data, env }, null, 2)}\n`
    );
    return;
  }

  if (action === 'publish') {
    const assessmentId = id ?? getFlag(flags, 'id');
    if (!assessmentId) {
      throw new CliError({
        code: 'MISSING_ASSESSMENT_ID',
        exitCode: CLI_EXIT.usage,
        message:
          'Pass an assessment ID: `ttr external upskii assessments publish <id> --yes`.',
      });
    }

    const gate = await requireMutationGate({
      explicitEnvFlag: options.explicitEnvFlag,
      flags,
      json,
      noColor,
      preview: {
        applyHint: `ttr external upskii assessments publish ${assessmentId} --env ${env}${env === 'prod' ? ' --reason "<reason>"' : ''} --yes`,
        changes: [{ after: 'published', field: 'status' }],
        env,
        origin: client.origins.app,
        target: `assessment:${assessmentId}`,
        tier: 1,
        title: 'Publish Upskii assessment',
      },
      write,
    });
    if (!gate.applied) return;

    const res = await client.requestJson<Record<string, unknown>>({
      body: { assessmentId },
      command: 'external.upskii.assessments.publish',
      method: 'POST',
      path: `${client.apiBase}/assessments/${encodeURIComponent(assessmentId)}/publish`,
      reason: gate.reason,
    });
    write(
      `${JSON.stringify({ applied: true, assessmentId, env, result: res.data }, null, 2)}\n`
    );
    return;
  }

  throw new CliError({
    code: 'UNKNOWN_ASSESSMENTS_ACTION',
    exitCode: CLI_EXIT.usage,
    hint: 'Run `ttr external upskii assessments --help`.',
    message: `Unknown assessments action "${action}".`,
  });
}

export async function runUpskiiTutorCommand(
  options: UpskiiAssessmentsTutorOptions
): Promise<void> {
  const write =
    options.write ?? ((chunk: string) => process.stdout.write(chunk));
  const { flags, positionals } = parseArgs(options.args);
  const [action = 'sessions', subAction, extraId] = positionals;

  if (action === 'help' || flags.help === true || flags.h === true) {
    write(`${upskiiTutorHelp()}\n`);
    return;
  }

  rejectSecretFlags(flags);
  const { client, env, json, noColor } = options;

  const fetchSession = async (sessionId: string | undefined) => {
    const resolvedId =
      sessionId ?? getFlag(flags, 'session') ?? getFlag(flags, 'id');
    if (!resolvedId) {
      throw new CliError({
        code: 'MISSING_SESSION_ID',
        exitCode: CLI_EXIT.usage,
        message:
          'Pass a tutor session ID: `ttr external upskii tutor get <sessionId>`.',
      });
    }
    const res = await client.requestJson<Record<string, unknown>>({
      command: 'external.upskii.tutor.get',
      path: `${client.apiBase}/tutor/sessions/${encodeURIComponent(resolvedId)}`,
    });
    write(`${JSON.stringify(res.data, null, 2)}\n`);
  };

  if (action === 'sessions') {
    const verb = subAction ?? 'list';
    if (verb === 'get' || verb === 'show') {
      await fetchSession(extraId);
      return;
    }
    if (verb !== 'list' && verb !== 'ls') {
      throw new CliError({
        code: 'UNKNOWN_TUTOR_ACTION',
        exitCode: CLI_EXIT.usage,
        hint: 'Run `ttr external upskii tutor --help`.',
        message: `Unknown tutor sessions action "${verb}".`,
      });
    }
    const classId = getFlag(flags, 'class');
    const path = classId
      ? `${client.apiBase}/tutor/sessions?classId=${encodeURIComponent(classId)}`
      : `${client.apiBase}/tutor/sessions`;
    let res: Awaited<
      ReturnType<
        typeof client.requestJson<{
          items?: Array<Record<string, unknown>>;
          sessions?: Array<Record<string, unknown>>;
        }>
      >
    >;
    try {
      res = await client.requestJson<{
        items?: Array<Record<string, unknown>>;
        sessions?: Array<Record<string, unknown>>;
      }>({
        command: 'external.upskii.tutor.sessions.list',
        path,
      });
    } catch (error) {
      rethrowUnavailableEndpoint(
        error,
        'Upskii tutor session listing',
        env,
        path
      );
    }
    const sessions = Array.isArray(res.data.sessions)
      ? res.data.sessions
      : Array.isArray(res.data.items)
        ? res.data.items
        : [];
    if (json) {
      write(
        `${JSON.stringify({ classId: classId ?? null, count: sessions.length, d1Telemetry: res.d1Telemetry, env, sessions }, null, 2)}\n`
      );
      return;
    }
    write(
      formatTable(
        sessions.map((session) => ({
          ClassId: String(session.classId ?? session.class_id ?? ''),
          Id: String(session.id ?? ''),
          Status: String(session.status ?? ''),
          UpdatedAt: String(session.updatedAt ?? session.updated_at ?? ''),
        })),
        { emptyMessage: 'No tutor sessions found.', noColor }
      )
    );
    return;
  }

  if (action === 'get' || action === 'show') {
    await fetchSession(subAction);
    return;
  }

  if (action === 'prompts') {
    const verb = subAction ?? 'list';
    if (verb !== 'list' && verb !== 'ls') {
      throw new CliError({
        code: 'UNKNOWN_TUTOR_ACTION',
        exitCode: CLI_EXIT.usage,
        hint: 'Run `ttr external upskii tutor --help`.',
        message: `Unknown tutor prompts action "${verb}".`,
      });
    }
    if (Object.hasOwn(flags, 'class')) {
      throw new CliError({
        code: 'UNSUPPORTED_FILTER',
        exitCode: CLI_EXIT.usage,
        hint: 'Omit --class; /api/upskii/prompt-library returns the global prompt catalog.',
        message:
          'Filtering tutor prompts by --class is not supported by /api/upskii/prompt-library.',
      });
    }
    const res = await client.requestJson<{
      categories?: Array<Record<string, unknown>>;
      items?: Array<Record<string, unknown>>;
      prompts?: Array<Record<string, unknown>>;
    }>({
      command: 'external.upskii.tutor.prompts.list',
      path: `${client.apiBase}/prompt-library`,
    });
    const prompts = Array.isArray(res.data.prompts)
      ? res.data.prompts
      : Array.isArray(res.data.items)
        ? res.data.items
        : [];
    if (json) {
      write(
        `${JSON.stringify({ count: prompts.length, d1Telemetry: res.d1Telemetry, env, prompts }, null, 2)}\n`
      );
      return;
    }
    write(
      formatTable(
        prompts.map((entry) => ({
          Category: String(entry.category ?? ''),
          Id: String(entry.id ?? ''),
          Title: String(entry.title ?? entry.name ?? ''),
        })),
        { emptyMessage: 'No tutor prompts found.', noColor }
      )
    );
    return;
  }

  if (action === 'smoke') {
    const classId = requiredFlag(flags, 'class');
    const prompt =
      getFlag(flags, 'prompt') ??
      'Reply with one short sentence confirming Upskii tutor is responsive.';
    const maxLatencyMs = Number(getFlag(flags, 'max-latency-ms') ?? '20000');
    if (!Number.isFinite(maxLatencyMs) || maxLatencyMs <= 0) {
      throw new CliError({
        code: 'INVALID_MAX_LATENCY',
        exitCode: CLI_EXIT.usage,
        message: '--max-latency-ms must be a positive number.',
      });
    }
    const expectStream = flags['expect-stream'] === true;

    const gate = await requireMutationGate({
      explicitEnvFlag: options.explicitEnvFlag,
      flags,
      json,
      noColor,
      preview: {
        applyHint: `ttr external upskii tutor smoke --env ${env} --class ${classId}${expectStream ? ' --expect-stream' : ''}${env === 'prod' ? ' --reason "<reason>"' : ''} --yes`,
        changes: [
          { after: classId, field: 'classId' },
          { after: prompt.slice(0, 80), field: 'prompt' },
          { after: expectStream ? 'stream' : 'json', field: 'transport' },
        ],
        env,
        origin: client.origins.app,
        target: `tutor-smoke:${classId}`,
        tier: 1,
        title: 'Run bounded Upskii tutor smoke (1 model call)',
      },
      write,
    });
    if (!gate.applied) return;

    const body = { classId, prompt };
    const started = Date.now();
    let result: Record<string, unknown>;

    if (expectStream) {
      const streamed = await client.requestStream({
        body,
        command: 'external.upskii.tutor.smoke',
        path: `${client.apiBase}/tutor/smoke`,
        timeoutMs: Math.max(5_000, maxLatencyMs),
      });
      const ok =
        streamed.chunks > 0 &&
        streamed.elapsedMs <= maxLatencyMs &&
        streamed.preview.length > 0;
      result = {
        applied: true,
        chunks: streamed.chunks,
        d1Telemetry: streamed.d1Telemetry,
        elapsedMs: streamed.elapsedMs,
        env,
        firstChunkMs: streamed.firstChunkMs,
        maxLatencyMs,
        ok,
        preview: streamed.preview,
        status: streamed.status,
      };
    } else {
      const res = await client.requestJson<Record<string, unknown>>({
        body,
        command: 'external.upskii.tutor.smoke',
        method: 'POST',
        path: `${client.apiBase}/tutor/smoke`,
        reason: gate.reason,
        timeoutMs: Math.max(5_000, maxLatencyMs),
      });
      const elapsedMs = Date.now() - started;
      result = {
        applied: true,
        d1Telemetry: res.d1Telemetry,
        elapsedMs,
        env,
        maxLatencyMs,
        ok: elapsedMs <= maxLatencyMs,
        response: res.data,
        status: res.status,
      };
    }

    write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.ok !== true) {
      throw new CliError({
        code: 'TUTOR_SMOKE_FAILED',
        exitCode: CLI_EXIT.unavailable,
        message: 'Upskii tutor smoke failed latency or stream assertions.',
      });
    }
    return;
  }

  throw new CliError({
    code: 'UNKNOWN_TUTOR_ACTION',
    exitCode: CLI_EXIT.usage,
    hint: 'Run `ttr external upskii tutor --help`.',
    message: `Unknown tutor action "${action}".`,
  });
}
