import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { readLedger } from '../src/hook-ledger';

interface AdmissionChild {
  ready: Promise<void>;
  result: Promise<{ code: number | null; stdout: string; stderr: string }>;
  start: (account: Record<string, unknown>) => void;
  stop: () => void;
}

let directory: string | undefined;
let children: AdmissionChild[] = [];
const CHILD_STARTUP_TIMEOUT_MS = 30_000;

beforeEach(async () => {
  const fixtureDirectory = await mkdtemp(
    join(tmpdir(), 'quota-positional-admits-')
  );
  directory = fixtureDirectory;
  let packageRoot = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(resolve(packageRoot, 'src/positional-admit.ts'))) {
    const parent = dirname(packageRoot);
    if (parent === packageRoot) throw Error('quota package source not found');
    packageRoot = parent;
  }
  const ledgerUrl = pathToFileURL(
    resolve(packageRoot, 'src/hook-ledger.ts')
  ).href;
  const admissionUrl = pathToFileURL(
    resolve(packageRoot, 'src/positional-admit.ts')
  ).href;
  const script = `import { transactLedger } from ${JSON.stringify(ledgerUrl)};
import { runPositionalAdmit } from ${JSON.stringify(admissionUrl)};
const directory = process.argv.at(-1);
process.stderr.write('quota-ready\\n');
const account = JSON.parse(await new Response(Bun.stdin.stream()).text());
await runPositionalAdmit([account.instanceId, account.models[0]], () => '', {
  readBlockLedger: async () => ({ version: 1, blocks: [] }),
  collectAll: async () => ({ accounts: [account], active: [], t3ObservedAt: new Date().toISOString(), blocks: [], poolSettings: {}, invalidObservations: [] }),
  collectPoolReceipts: () => ({ threads: [], runs: [], tasks: [], failures: [], transfers: [] }),
  transactLedger: operation => transactLedger(operation, directory),
  now: () => new Date(),
});`;
  children = Array.from({ length: 8 }, () => {
    const child = spawn('bun', ['-e', script, fixtureDirectory], {
      cwd: packageRoot,
      env: { HOME: fixtureDirectory, PATH: process.env.PATH ?? '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    child.stdout.setEncoding('utf8').on('data', (part) => (stdout += part));
    child.stderr.setEncoding('utf8').on('data', (part) => {
      stderr += part;
      if (stderr.includes('quota-ready\n')) resolveReady();
    });
    child.stdin.on('error', (error) => {
      stderr += error.message;
    });
    child.on('error', (error) => {
      stderr += error.message;
      rejectReady(error);
    });
    return {
      ready,
      result: new Promise((done) => {
        child.once('close', (code) => {
          rejectReady(
            new Error(`Admission child exited before ready: ${stderr}`)
          );
          done({ code, stdout, stderr });
        });
      }),
      start: (account: Record<string, unknown>) =>
        child.stdin.end(JSON.stringify(account)),
      stop: () => {
        if (child.exitCode === null && child.signalCode === null) child.kill();
      },
    } satisfies AdmissionChild;
  });
  await Promise.all(children.map((child) => child.ready));
}, CHILD_STARTUP_TIMEOUT_MS);

afterEach(async () => {
  for (const child of children) child.stop();
  await Promise.all(children.map((child) => child.result));
  children = [];
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

async function runHerd(account: Record<string, unknown>) {
  if (!directory) throw Error('admission ledger fixture missing');
  for (const child of children) child.start(account);
  const results = await Promise.all(children.map((child) => child.result));
  // On mismatch, print every child's decision to explain the failure.
  expect(
    results.map((result) => result.code).sort(),
    JSON.stringify(
      results.map(({ code, stdout, stderr }) => ({
        code,
        stdout: stdout.trim().slice(0, 500),
        stderr: stderr.trim().slice(0, 500),
      }))
    )
  ).toEqual([0, 3, 3, 3, 3, 3, 3, 3]);
  const decisions = results.map((result) => JSON.parse(result.stdout.trim()));
  expect(decisions.filter((result) => result.status === 'ADMIT')).toHaveLength(
    1
  );
  expect(
    decisions.filter((result) =>
      result.reasons?.includes('pool-reserve')
        ? account.instanceId === 'claude_hehe'
        : result.reasons?.includes('unknown-reservation-cap')
    )
  ).toHaveLength(7);
  const ledger = await readLedger(directory);
  expect(ledger.reservations).toHaveLength(1);
  expect(
    Date.parse(ledger.reservations[0]!.expiresAt!) -
      Date.parse(ledger.reservations[0]!.createdAt)
  ).toBe(5 * 60_000);
}

it('bounds eight concurrent UNKNOWN positional admits with provisional reservations', async () => {
  await runHerd({
    instanceId: 'claudeAgent',
    provider: 'claude',
    label: 'fixture',
    available: true,
    models: ['claude-opus-4-6'],
    windows: [],
  });
});

it('bounds eight concurrent fresh admissions at the Claude owner concurrency cap', async () => {
  const now = new Date();
  await runHerd({
    instanceId: 'claude_hehe',
    provider: 'claude',
    label: 'fixture',
    available: true,
    models: ['claude-opus-4-6'],
    windows: [
      {
        id: 'five_hour',
        kind: 'short',
        usedPercent: 20,
        observedAt: now.toISOString(),
        resetsAt: new Date(now.getTime() + 60 * 60_000).toISOString(),
        source: 'fixture',
        authoritative: true,
      },
    ],
  });
});
