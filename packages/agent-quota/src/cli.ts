#!/usr/bin/env bun
import { argumentValue } from './cli-args';
import { collectAll } from './collectors';
import { recommend, recommendAssignments } from './policy';
import { parseReserves } from './reserves';
import type { Provider } from './types';

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
  if (command !== 'status' && command !== 'recommend') {
    throw new Error(
      'Usage: bun packages/agent-quota/src/cli.ts status|recommend [--provider codex|claude] [--count N] [--json]'
    );
  }
  const provider = arg('--provider');
  if (provider && provider !== 'codex' && provider !== 'claude')
    throw new Error('--provider must be codex or claude.');
  const { accounts, active, t3ObservedAt, t3Error } = await collectAll();
  const filtered = accounts.filter(
    (account) => !provider || account.provider === provider
  );
  const reserves = parseReserves();
  if (command === 'status') {
    const result = filtered.map((account) => ({
      ...account,
      activeCount: active
        ? (active.find((item) => item.instanceId === account.instanceId)
            ?.count ?? 0)
        : 'unknown',
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
        'ACCOUNT        PROVIDER  SHORT  LONG  ESTIMATED TOKENS  ACTIVE  OBSERVED'
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
          `${account.instanceId.padEnd(14)} ${account.provider.padEnd(8)} ${percent(account.windows, 'short').padEnd(6)} ${percent(account.windows, 'long').padEnd(5)} ${String(estimated ?? '—').padEnd(17)} ${String(account.activeCount).padEnd(6)} ${observed}`
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
  const task = {
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
    console.log('RANK  ACCOUNT        SCORE  STATUS     REASONS');
    for (const [index, item] of ranked.entries()) {
      const messages = item.reasons.map((reason) => reason.message).join(' ');
      console.log(
        `${String(index + 1).padEnd(5)} ${item.instanceId.padEnd(14)} ${String(Math.round(item.score)).padEnd(6)} ${item.eligible ? 'eligible' : 'excluded'.padEnd(9)} ${messages}`
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
