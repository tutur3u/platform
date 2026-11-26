import { readFile } from 'node:fs/promises';
import { getFlag, parseArgs } from '../args';
import { CLI_EXIT, CliError } from '../cli-contracts';
import type { CliEnv } from '../cli-env';
import { requireMutationGate } from '../safety-gate';
import { formatTable } from '../ui/table';
import { createTheme } from '../ui/theme';
import { parseWatchInterval, runWatchLoop } from '../ui/watch';
import { assertSafeResponseText } from './http';
import type { UpskiiProductClient } from './product-client';

export interface UpskiiRuntimeCommandOptions {
  args: string[];
  client: UpskiiProductClient;
  env: CliEnv;
  explicitEnvFlag?: boolean;
  fetch?: typeof globalThis.fetch;
  json: boolean;
  noColor?: boolean;
  resolveQaToken?: () => Promise<string | null>;
  write?: (chunk: string) => void;
}

export function upskiiChatHelp(): string {
  return [
    'ttr external upskii chat — Upskii AI chat conversations, model catalog, and bounded E2E smoke',
    '',
    'Usage:',
    '  ttr external upskii chat conversations list --class <classId> [--module <m>] [--json]',
    '  ttr external upskii chat models [list] [--json]',
    '  ttr external upskii chat smoke --class <classId> [--prompt <text>] [--max-latency-ms 15000] [--expect-stream] [--budget-guard 1] [--yes] [--json]',
  ].join('\n');
}

export function upskiiCreditsHelp(): string {
  return [
    'ttr external upskii credits — read Upskii AI credit balances and assert smoke deltas',
    '',
    'Usage:',
    '  ttr external upskii credits balance [--watch [seconds]] [--json]',
    '  ttr external upskii credits check [--min-remaining <n>] [--compare-before <file>] [--json]',
    '  ttr external upskii credits usage [--json]',
  ].join('\n');
}

export function upskiiStatusHelp(): string {
  return [
    'ttr external upskii status — health, QA provisioner, D1 telemetry, and E3 link readiness',
    '',
    'Usage:',
    '  ttr external upskii status health [--watch [seconds]] [--json]',
    '  ttr external upskii status provisioner [--json]',
    '  ttr external upskii status link-readiness [--session-file <path>] [--json]',
  ].join('\n');
}

function numericCreditRemaining(
  payload: Record<string, unknown>
): number | null {
  for (const key of [
    'remaining',
    'remainingCredits',
    'creditsRemaining',
    'balance',
    'available',
  ]) {
    const value = payload[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

export async function runUpskiiChatCommand(
  options: UpskiiRuntimeCommandOptions
): Promise<void> {
  const write =
    options.write ?? ((chunk: string) => process.stdout.write(chunk));
  const { flags, positionals } = parseArgs(options.args);
  const [action = 'models'] = positionals;

  if (action === 'help' || flags.help === true || flags.h === true) {
    write(`${upskiiChatHelp()}\n`);
    return;
  }

  const { client, env, json, noColor } = options;

  if (action === 'models') {
    const res = await client.requestJson<{
      models?: Array<Record<string, unknown>>;
    }>({
      command: 'external.upskii.chat.models',
      path: `${client.apiBase}/ai-model-catalog`,
    });
    const models = Array.isArray(res.data.models) ? res.data.models : [];
    if (json) {
      write(`${JSON.stringify(res.data, null, 2)}\n`);
      return;
    }
    write(
      formatTable(
        models.map((m) => ({
          Id: String(m.id ?? ''),
          Name: String(m.name ?? m.label ?? ''),
          Provider: String(m.provider ?? ''),
        })),
        { emptyMessage: 'No AI models returned.', noColor }
      )
    );
    return;
  }

  if (action === 'conversations') {
    const classId = getFlag(flags, 'class');
    if (!classId) {
      throw new CliError({
        code: 'MISSING_FLAG',
        exitCode: CLI_EXIT.usage,
        message: 'Pass --class <classId>.',
      });
    }
    const chatModule = getFlag(flags, 'module') ?? 'general';
    const res = await client.requestJson<{
      conversations?: Array<Record<string, unknown>>;
    }>({
      command: 'external.upskii.chat.conversations',
      path: `${client.apiBase}/ai-chat?classId=${encodeURIComponent(classId)}&module=${encodeURIComponent(chatModule)}`,
    });
    const conversations = res.data.conversations ?? [];
    if (json) {
      write(`${JSON.stringify(res.data, null, 2)}\n`);
      return;
    }
    write(
      formatTable(
        conversations.map((c) => ({
          Id: String(c.id ?? ''),
          Title: String(c.title ?? ''),
          UpdatedAt: String(c.updatedAt ?? c.updated_at ?? ''),
        })),
        { emptyMessage: 'No AI chat conversations found.', noColor }
      )
    );
    return;
  }

  if (action === 'smoke') {
    const classId = getFlag(flags, 'class');
    if (!classId) {
      throw new CliError({
        code: 'MISSING_FLAG',
        exitCode: CLI_EXIT.usage,
        message: 'Pass --class <classId> for `chat smoke`.',
      });
    }
    const prompt =
      getFlag(flags, 'prompt') ??
      'Reply with one short sentence confirming Upskii AI chat is responsive.';
    const maxLatencyMs = Number(getFlag(flags, 'max-latency-ms') ?? '20000');
    const budgetGuard = Number(getFlag(flags, 'budget-guard') ?? '1');
    if (!Number.isInteger(budgetGuard) || budgetGuard < 1 || budgetGuard > 3) {
      throw new CliError({
        code: 'INVALID_BUDGET_GUARD',
        exitCode: CLI_EXIT.usage,
        message: '--budget-guard must be an integer between 1 and 3.',
      });
    }
    const expectStream = flags['expect-stream'] === true;

    const gate = await requireMutationGate({
      explicitEnvFlag: options.explicitEnvFlag,
      flags,
      json,
      noColor,
      preview: {
        applyHint: `ttr external upskii chat smoke --env ${env} --class ${classId} --yes`,
        changes: [
          { after: classId, field: 'classId' },
          { after: prompt.slice(0, 80), field: 'prompt' },
          { after: expectStream ? 'stream' : 'json', field: 'transport' },
          { after: budgetGuard, field: 'maxCalls' },
        ],
        env,
        origin: client.origins.app,
        target: `ai-chat-smoke:${classId}`,
        tier: 1,
        title: 'Run bounded Upskii AI chat smoke (1 model call)',
      },
      write,
    });
    if (!gate.applied) return;

    const chatModule = getFlag(flags, 'module') ?? 'general';
    const body = { classId, module: chatModule, prompt };
    const started = Date.now();
    let result: Record<string, unknown>;

    if (expectStream) {
      const streamed = await client.requestStream({
        body,
        command: 'external.upskii.chat.smoke',
        path: `${client.apiBase}/ai-chat`,
        timeoutMs: Math.max(5_000, maxLatencyMs),
      });
      const ok =
        streamed.chunks > 0 &&
        streamed.elapsedMs <= maxLatencyMs &&
        streamed.preview.length > 0;
      result = {
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
        command: 'external.upskii.chat.smoke',
        method: 'POST',
        path: `${client.apiBase}/ai-chat`,
        reason: gate.reason,
        timeoutMs: Math.max(5_000, maxLatencyMs),
      });
      const elapsedMs = Date.now() - started;
      result = {
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
        code: 'AI_CHAT_SMOKE_FAILED',
        exitCode: CLI_EXIT.unavailable,
        message: 'Upskii AI chat smoke failed latency or stream assertions.',
      });
    }
    return;
  }

  throw new CliError({
    code: 'UNKNOWN_CHAT_ACTION',
    exitCode: CLI_EXIT.usage,
    hint: 'Run `ttr external upskii chat --help`.',
    message: `Unknown chat action "${action}".`,
  });
}

export async function runUpskiiCreditsCommand(
  options: UpskiiRuntimeCommandOptions
): Promise<void> {
  const write =
    options.write ?? ((chunk: string) => process.stdout.write(chunk));
  const { flags, positionals } = parseArgs(options.args);
  const [action = 'balance'] = positionals;

  if (action === 'help' || flags.help === true || flags.h === true) {
    write(`${upskiiCreditsHelp()}\n`);
    return;
  }

  const { client, env, json, noColor } = options;

  if (action === 'balance' || action === 'check') {
    const watchSeconds =
      action === 'balance' ? parseWatchInterval(flags.watch, 15) : 0;
    const readBalance = async () => {
      const res = await client.requestJson<Record<string, unknown>>({
        command: `external.upskii.credits.${action}`,
        path: `${client.apiBase}/usage/credits`,
      });
      return {
        ...res.data,
        d1Telemetry: res.d1Telemetry,
        env,
        remaining: numericCreditRemaining(res.data),
      };
    };

    const renderHuman = (balance: Record<string, unknown>) =>
      formatTable(
        [
          {
            Actor: String(balance.actorId ?? ''),
            Env: String(balance.env ?? env),
            Remaining:
              balance.remaining === null
                ? 'unknown'
                : String(balance.remaining),
            Tier: String(balance.tier ?? balance.plan ?? ''),
          },
        ],
        { noColor }
      );

    if (watchSeconds > 0) {
      await runWatchLoop({
        fetch: () => readBalance(),
        intervalSeconds: watchSeconds,
        json,
        jsonl: flags.jsonl === true,
        renderHuman,
        title: `Upskii AI Credits (${env})`,
        write,
      });
      return;
    }

    const current = await readBalance();
    if (action === 'balance') {
      write(
        json ? `${JSON.stringify(current, null, 2)}\n` : renderHuman(current)
      );
      return;
    }

    const minRemainingRaw = getFlag(flags, 'min-remaining');
    const minRemaining =
      minRemainingRaw !== undefined ? Number(minRemainingRaw) : undefined;
    let delta: number | null = null;
    const comparePath = getFlag(flags, 'compare-before');
    if (comparePath) {
      const before = JSON.parse(await readFile(comparePath, 'utf8')) as Record<
        string,
        unknown
      >;
      const beforeRemaining = numericCreditRemaining(before);
      if (beforeRemaining !== null && current.remaining !== null) {
        delta = current.remaining - beforeRemaining;
      }
    }

    const meetsMin =
      minRemaining === undefined ||
      (current.remaining !== null && current.remaining >= minRemaining);
    const report = {
      current,
      delta,
      minRemaining: minRemaining ?? null,
      ok: meetsMin,
    };
    write(`${JSON.stringify(report, null, 2)}\n`);
    if (!meetsMin) {
      throw new CliError({
        code: 'CREDITS_BELOW_THRESHOLD',
        exitCode: CLI_EXIT.conflict,
        message: `Upskii credits (${current.remaining ?? 'unknown'}) below --min-remaining ${minRemaining}.`,
      });
    }
    return;
  }

  if (action === 'usage') {
    const res = await client.requestJson<Record<string, unknown>>({
      command: 'external.upskii.credits.usage',
      path: `${client.apiBase}/usage/analytics`,
    });
    write(`${JSON.stringify(res.data, null, 2)}\n`);
    return;
  }

  throw new CliError({
    code: 'UNKNOWN_CREDITS_ACTION',
    exitCode: CLI_EXIT.usage,
    hint: 'Run `ttr external upskii credits --help`.',
    message: `Unknown credits action "${action}".`,
  });
}

export async function runUpskiiStatusCommand(
  options: UpskiiRuntimeCommandOptions
): Promise<void> {
  const write =
    options.write ?? ((chunk: string) => process.stdout.write(chunk));
  const { flags, positionals } = parseArgs(options.args);
  const [action = 'health'] = positionals;

  if (action === 'help' || flags.help === true || flags.h === true) {
    write(`${upskiiStatusHelp()}\n`);
    return;
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  const { client, env, json, noColor } = options;
  const theme = createTheme({ noColor });

  if (action === 'health') {
    const watchSeconds = parseWatchInterval(flags.watch, 15);
    const probeAll = async () => {
      const targets = [
        { name: 'auth', url: `${client.origins.auth}/` },
        { name: 'app', url: `${client.origins.app}/` },
        { name: 'admin', url: `${client.origins.admin}/` },
      ];
      const checks = await Promise.all(
        targets.map(async (target) => {
          const started = Date.now();
          try {
            const res = await fetchImpl(target.url, {
              method: 'HEAD',
              redirect: 'manual',
              signal: AbortSignal.timeout(8_000),
            });
            return {
              latencyMs: Date.now() - started,
              name: target.name,
              ok: res.status >= 200 && res.status < 400,
              server: res.headers.get('server') ?? '',
              status: res.status,
              url: target.url,
            };
          } catch (error) {
            return {
              error: error instanceof Error ? error.message : 'unreachable',
              latencyMs: Date.now() - started,
              name: target.name,
              ok: false,
              server: '',
              status: 0,
              url: target.url,
            };
          }
        })
      );
      return { checks, env, ok: checks.every((c) => c.ok) };
    };

    const renderHuman = (snap: Awaited<ReturnType<typeof probeAll>>) =>
      formatTable(
        snap.checks.map((c) => ({
          Host: c.name,
          Latency: `${c.latencyMs}ms`,
          Server: c.server,
          Status: c.ok
            ? theme.ok(String(c.status))
            : theme.err(String(c.status || 'ERR')),
          Url: c.url,
        })),
        { noColor }
      );

    if (watchSeconds > 0) {
      await runWatchLoop({
        fetch: () => probeAll(),
        intervalSeconds: watchSeconds,
        json,
        jsonl: flags.jsonl === true,
        renderHuman,
        title: `Upskii Health (${env})`,
        write,
      });
      return;
    }

    const result = await probeAll();
    write(json ? `${JSON.stringify(result, null, 2)}\n` : renderHuman(result));
    return;
  }

  if (action === 'provisioner') {
    if (env === 'prod' && options.explicitEnvFlag !== true) {
      throw new CliError({
        code: 'PROD_ENV_EXPLICIT_REQUIRED',
        exitCode: CLI_EXIT.policy,
        hint: 'Pass --env prod explicitly to inspect production Upskii QA provisioner status.',
        message:
          'Refusing to target prod QA provisioner without explicit --env prod.',
      });
    }
    const token = options.resolveQaToken
      ? await options.resolveQaToken()
      : null;
    if (!token) {
      const payload = {
        configured: false,
        env,
        hint: `Run \`ttr external upskii auth login --mode qa --env ${env} --token-stdin --yes\`.`,
        origin: client.origins.admin,
      };
      write(
        json
          ? `${JSON.stringify(payload, null, 2)}\n`
          : `${theme.warn('Not configured')}: no Upskii QA token for ${env}.\n${payload.hint}\n`
      );
      return;
    }
    if (flags.probe !== true) {
      const payload = {
        configured: true,
        env,
        hint: 'Pass --probe to execute an authenticated GET against /api/admin/qa/users.',
        origin: client.origins.admin,
        probed: false,
      };
      write(
        json
          ? `${JSON.stringify(payload, null, 2)}\n`
          : `Upskii QA provisioner credential configured for ${env} (${client.origins.admin}). Pass --probe to verify remote window.\n`
      );
      return;
    }
    const res = await fetchImpl(`${client.origins.admin}/api/admin/qa/users`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'x-qa-request-id': crypto.randomUUID(),
      },
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
    const bodyText = await res.text().catch(() => '');
    assertSafeResponseText(bodyText, [token]);
    const payload = {
      configured: true,
      env,
      ok: res.ok,
      origin: client.origins.admin,
      probed: true,
      status: res.status,
      windowOpen: res.ok,
    };
    write(`${JSON.stringify(payload, null, 2)}\n`);
    return;
  }

  if (action === 'link-readiness') {
    const res = await client.requestJson<Record<string, unknown>>({
      command: 'external.upskii.status.link-readiness',
      path: `${client.apiBase}/integrations/tuturuuu`,
    });
    write(`${JSON.stringify({ env, ...res.data }, null, 2)}\n`);
    return;
  }

  throw new CliError({
    code: 'UNKNOWN_STATUS_ACTION',
    exitCode: CLI_EXIT.usage,
    hint: 'Run `ttr external upskii status --help`.',
    message: `Unknown status action "${action}".`,
  });
}
