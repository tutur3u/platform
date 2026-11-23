#!/usr/bin/env bun

import { readFileSync } from 'node:fs';
import { collapseAccounts } from './accounts';
import { runBlock } from './block-cli';
import { runCheckpointReady } from './checkpoint-ready';
import { argumentValue } from './cli-args';
import { collectAll } from './collectors';
import { runHook } from './hook-cli';
import { runOperator } from './operator-cli';
import { computeAccountPacing } from './pacing';
import {
  appendPacingSnapshots,
  mergeObservationsIntoHistory,
  readPacingHistory,
} from './pacing-history';
import { recommend, recommendAssignments, SIGNAL_TTL_MS } from './policy';
import { runPositionalAdmit } from './positional-admit';
import { runReconcile } from './reconcile-cli';
import { runReroute } from './reroute-cli';
import { parseReserves } from './reserves';
import { loadRoutingConfig } from './routing-config';
import { formatRecommendTable, formatStatusTable } from './table';
import type { Provider, TaskKind, TaskRequest } from './types';
import { evaluateWatch, type WatchVerdict } from './watch';
import {
  windowFreshnessTtlMs,
  windowObservationIsFresh,
} from './window-freshness';

const PROVIDERS = new Set<Provider>([
  'codex',
  'claude',
  'antigravity',
  'grok',
  'cursor',
  'opencode',
]);
const TASK_KINDS = new Set<TaskKind>([
  'implementation',
  'analysis',
  'review',
  'research',
  'design',
  'ui',
]);

const arg = (flag: string) => argumentValue(flag);

function outputJson(): boolean {
  return process.argv.includes('--json');
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (
    command &&
    ['explain', 'dry-run', 'import-usage', 'configure'].includes(command)
  ) {
    await runOperator(command, process.argv.slice(3));
    return;
  }
  if (command === 'block') {
    await runBlock(process.argv.slice(3));
    return;
  }
  if (command === 'watch') {
    const owner = arg('--owner');
    if (!owner) throw new Error('watch-owner-required');
    const numberArg = (flag: string, fallback: number) => {
      const value = arg(flag);
      if (value === undefined) return fallback;
      const number = Number(value);
      if (!Number.isFinite(number))
        throw new Error(`watch-option-invalid:${flag}`);
      return number;
    };
    const previous = arg('--previous-verdict');
    const role = arg('--role') ?? 'child';
    if (role !== 'main' && role !== 'child')
      throw new Error('watch-option-invalid:--role');
    if (
      previous !== undefined &&
      !['ok', 'warn', 'switch-now'].includes(previous)
    )
      throw new Error('watch-option-invalid:--previous-verdict');
    try {
      const result = await evaluateWatch(owner, {
        warnPercent: numberArg('--warn-percent', 25),
        criticalPercent: numberArg('--critical-percent', 12),
        hysteresisPercent: numberArg('--hysteresis-percent', 3),
        previous: previous as WatchVerdict | undefined,
        role,
        allowNonClaudeFallback: process.argv.includes(
          '--allow-non-claude-fallback'
        ),
        model: arg('--model'),
      });
      console.log(JSON.stringify(result));
      process.exitCode =
        result.verdict === 'ok' ? 0 : result.verdict === 'warn' ? 3 : 4;
    } catch (error) {
      console.log(
        JSON.stringify({
          verdict: 'warn',
          owner,
          state: 'UNKNOWN',
          remainingPercent: null,
          successor: null,
          reason: error instanceof Error ? error.message : 'watch-unavailable',
        })
      );
      process.exitCode = 3;
    }
    return;
  }
  if (command === 'checkpoint-ready') {
    runCheckpointReady(process.argv.slice(3));
    return;
  }
  if (command === 'admit' && process.argv[3]) {
    await runPositionalAdmit(process.argv.slice(3));
    return;
  }
  if (command === 'reroute-plan') {
    await runReroute(process.argv.slice(3));
    return;
  }
  if (command === 'reconcile-children') {
    runReconcile(process.argv.slice(3));
    return;
  }
  if (
    command &&
    [
      'admit',
      'observe',
      'switch-check',
      'switch-lease',
      'handover-check',
    ].includes(command)
  ) {
    await runHook(command, process.argv[3]);
    return;
  }
  if (command !== 'status' && command !== 'recommend') {
    throw new Error(
      'Usage: bun packages/agent-quota/src/cli.ts status|recommend [--provider codex|claude|antigravity|grok|cursor|opencode] [--task-kind implementation|analysis|review|research|design|ui] [--count N] [--table] [--json]'
    );
  }
  const provider = arg('--provider');
  if (provider && !PROVIDERS.has(provider as Provider)) {
    throw new Error(
      '--provider must be codex, claude, antigravity, grok, cursor, or opencode.'
    );
  }
  const collected = await collectAll({
    snapshotsOnly: !process.argv.includes('--live'),
    catalog: process.argv.includes('--catalog-stdin')
      ? JSON.parse(readFileSync(0, 'utf8'))
      : undefined,
  });
  const {
    accounts,
    active,
    t3ObservedAt,
    t3Error,
    blocks,
    invalidObservations = [],
    manualObservations = [],
  } = collected;
  const filtered = accounts.filter(
    (account) => !provider || account.provider === provider
  );
  const reserves = parseReserves();
  const routingConfig = loadRoutingConfig();
  const rawHistory = await readPacingHistory();
  const history = mergeObservationsIntoHistory(rawHistory, manualObservations);

  if (command === 'status') {
    const observedAt = new Date();
    if (process.argv.includes('--record')) {
      await appendPacingSnapshots(filtered, observedAt);
    }
    const ranking = active
      ? recommend({
          task: {
            allowFable: process.argv.includes('--allow-fable'),
            nonPrivate: process.argv.includes('--non-private'),
          },
          active,
          accounts: filtered,
          blocks,
          reserves,
          history,
          routingConfig,
          now: observedAt,
        }).ranked
      : [];
    const result = collapseAccounts(filtered).map((account) => {
      const rankEntry = ranking.find(
        (item) => item.instanceId === account.instanceId
      );
      const count = active
        ? (active.find((item) => item.instanceId === account.instanceId)
            ?.count ?? 0)
        : 0;
      const pacing = computeAccountPacing(
        account,
        count,
        reserves[account.instanceId],
        history[account.instanceId] ?? {},
        observedAt,
        SIGNAL_TTL_MS[account.provider],
        {
          blocks,
          config: routingConfig.pacing,
          model:
            account.provider === 'opencode'
              ? (account.models?.find((m) => m.startsWith('opencode-go/')) ??
                'opencode-go/')
              : account.provider === 'antigravity'
                ? (rankEntry?.recommendedModel ?? 'gemini-4-hydrogen')
                : undefined,
        }
      );
      return {
        ...account,
        windows: account.windows.map((window) => ({
          ...window,
          ageMs: observedAt.getTime() - Date.parse(window.observedAt),
          ttlMs: windowFreshnessTtlMs(window, SIGNAL_TTL_MS[account.provider]),
          freshness: windowObservationIsFresh(
            window,
            observedAt,
            SIGNAL_TTL_MS[account.provider]
          )
            ? 'FRESH'
            : 'STALE',
        })),
        ...rankEntry,
        state: !active ? 'UNKNOWN' : (rankEntry?.state ?? 'UNKNOWN'),
        pacing,
        ...(!active
          ? {
              eligible: false,
              action: 'wait',
              reasons: [
                {
                  code: 't3-activity-unknown',
                  message: 'T3 activity state is unavailable.',
                },
              ],
            }
          : {}),
        activeCount: active ? count : 'unknown',
        accountIdentityHash: undefined,
        ...(reserves[account.instanceId]
          ? { reserve: reserves[account.instanceId] }
          : {}),
      };
    });
    if (outputJson())
      console.log(
        JSON.stringify(
          {
            observedAt: observedAt.toISOString(),
            t3ObservedAt,
            t3Error,
            accounts: result,
            invalidObservations,
          },
          null,
          2
        )
      );
    else {
      console.log(formatStatusTable(result, t3Error));
      if (invalidObservations.length)
        console.log(`INVALID OBSERVATIONS  ${invalidObservations.join('; ')}`);
    }
    return;
  }

  if (!active)
    throw new Error('Cannot recommend while T3 activity state is unknown.');
  const count = Number(arg('--count') ?? '1');
  if (!Number.isInteger(count) || count < 1 || count > 50)
    throw new Error('--count must be an integer from 1 to 50.');
  const kind = (arg('--task-kind') ?? 'implementation') as TaskKind;
  if (!TASK_KINDS.has(kind))
    throw new Error(
      '--task-kind must be implementation, analysis, review, research, design, or ui.'
    );
  const task: TaskRequest = {
    kind,
    provider: (provider ?? 'any') as Provider | 'any',
    model: arg('--model'),
    weight: Number(arg('--weight') ?? '1'),
    allowFable: process.argv.includes('--allow-fable'),
    nonPrivate: process.argv.includes('--non-private'),
  };
  if (!Number.isFinite(task.weight ?? 1) || (task.weight ?? 1) <= 0)
    throw new Error('--weight must be positive.');
  const assignmentOptions = {
    task,
    active,
    accounts: filtered,
    reserves,
    blocks,
    history,
    routingConfig,
  };
  const assignments = recommendAssignments({ ...assignmentOptions, count });
  const ranked = recommend({ ...assignmentOptions, count: 1 }).ranked;
  const result = {
    task,
    requestedCount: count,
    assignments,
    ranked,
    invalidObservations,
  };
  if (outputJson()) console.log(JSON.stringify(result, null, 2));
  else console.log(formatRecommendTable(ranked, assignments, kind));
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : 'Unable to read local usage sources.'
  );
  process.exitCode = 1;
});
