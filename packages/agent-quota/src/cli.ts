#!/usr/bin/env bun
import { readFileSync } from 'node:fs';
import { collapseAccounts } from './accounts';
import { argumentValue } from './cli-args';
import { collectAll } from './collectors';
import { runHook } from './hook-cli';
import { recommend, recommendAssignments } from './policy';
import { runReconcile } from './reconcile-cli';
import { runReroute } from './reroute-cli';
import { parseReserves } from './reserves';
import type { Provider, TaskRequest } from './types';

const arg = (flag: string) => argumentValue(flag);

function outputJson(): boolean {
  return process.argv.includes('--json');
}

function percent(
  accountWindows: Array<{ kind: string; usedPercent?: number }>,
  kind: string
): string {
  const window = accountWindows.find((item) => item.kind === kind);
  return window?.usedPercent === undefined
    ? '—'
    : `${Math.round(window.usedPercent)}%`;
}

async function main(): Promise<void> {
  const command = process.argv[2];
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
      'Usage: bun packages/agent-quota/src/cli.ts status|recommend [--provider codex|claude|antigravity] [--count N] [--json]'
    );
  }
  const provider = arg('--provider');
  if (
    provider &&
    provider !== 'codex' &&
    provider !== 'claude' &&
    provider !== 'antigravity'
  )
    throw new Error('--provider must be codex, claude, or antigravity.');
  const { accounts, active, t3ObservedAt, t3Error } = await collectAll({
    snapshotsOnly: process.argv.includes('--snapshots-only'),
    catalog: process.argv.includes('--catalog-stdin')
      ? JSON.parse(readFileSync(0, 'utf8'))
      : undefined,
  });
  const filtered = accounts.filter(
    (account) => !provider || account.provider === provider
  );
  const reserves = parseReserves();
  if (command === 'status') {
    const ranking = active
      ? recommend({ task: {}, active, accounts: filtered, reserves }).ranked
      : [];
    const result = collapseAccounts(filtered).map((account) => ({
      ...account,
      ...ranking.find((item) => item.instanceId === account.instanceId),
      ...(!active
        ? {
            state: 'UNKNOWN',
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
      activeCount: active
        ? (active.find((item) => item.instanceId === account.instanceId)
            ?.count ?? 0)
        : 'unknown',
      accountIdentityHash: undefined,
      ...(reserves[account.instanceId]
        ? { reserve: reserves[account.instanceId] }
        : {}),
    }));
    if (outputJson())
      console.log(
        JSON.stringify(
          {
            observedAt: new Date().toISOString(),
            t3ObservedAt,
            t3Error,
            accounts: result,
          },
          null,
          2
        )
      );
    else {
      console.log(
        'ACCOUNT        PROVIDER  SHORT  LONG  ESTIMATED TOKENS  ACTIVE  STATE  AGE(ms)  OBSERVED'
      );
      if (t3Error) console.log(`T3 activity unavailable: ${t3Error}`);
      for (const account of result) {
        const estimated = account.windows.find(
          (window) => window.estimated !== undefined
        )?.estimated;
        const observed =
          account.windows
            .filter((window) => window.usedPercent !== undefined)
            .map((window) => window.observedAt)
            .sort()
            .at(-1) ?? 'unknown';
        console.log(
          `${account.instanceId.padEnd(14)} ${account.provider.padEnd(8)} ${percent(account.windows, 'short').padEnd(6)} ${percent(account.windows, 'long').padEnd(5)} ${String(estimated ?? '—').padEnd(17)} ${String(account.activeCount).padEnd(6)} ${account.state} ${account.ageMs ?? 'unknown'} ${observed}`
        );
      }
    }
    return;
  }
  if (!active)
    throw new Error('Cannot recommend while T3 activity state is unknown.');
  const count = Number(arg('--count') ?? '1');
  if (!Number.isInteger(count) || count < 1 || count > 50)
    throw new Error('--count must be an integer from 1 to 50.');
  const kind = arg('--task-kind') ?? 'implementation';
  if (!['implementation', 'analysis', 'review', 'research'].includes(kind))
    throw new Error(
      '--task-kind must be implementation, analysis, review, or research.'
    );
  const task = {
    kind: kind as TaskRequest['kind'],
    provider: (provider ?? 'any') as Provider | 'any',
    model: arg('--model'),
    weight: Number(arg('--weight') ?? '1'),
  };
  if (!Number.isFinite(task.weight) || task.weight <= 0)
    throw new Error('--weight must be positive.');
  const assignmentOptions = { task, active, accounts: filtered, reserves };
  const assignments = recommendAssignments({ ...assignmentOptions, count });
  const ranked = recommend({ ...assignmentOptions, count: 1 }).ranked;
  const result = { task, requestedCount: count, assignments, ranked };
  if (outputJson()) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(
      'RANK  ACCOUNT        SCORE  STATE      AGE(ms)  ACTION  REASONS'
    );
    for (const [index, item] of ranked.entries()) {
      const messages = item.reasons.map((reason) => reason.message).join(' ');
      console.log(
        `${String(index + 1).padEnd(5)} ${item.instanceId.padEnd(14)} ${String(Math.round(item.score)).padEnd(6)} ${item.state.padEnd(10)} ${item.ageMs ?? 'unknown'} ${item.action} ${messages}`
      );
    }
    console.log(
      `Assignments: ${assignments.map((item) => item.instanceId).join(', ') || 'none'}`
    );
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : 'Unable to read local usage sources.'
  );
  process.exitCode = 1;
});
