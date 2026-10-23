import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';
import { readLedger } from '../src/hook-ledger';

it('bounds eight concurrent positional admissions to one provisional UNKNOWN reservation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'quota-positional-admits-'));
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
const [directory] = process.argv.slice(-1);
const account = { instanceId: 'claudeAgent', provider: 'claude', label: 'fixture', available: true, models: ['claude-opus-4-6'], windows: [] };
await runPositionalAdmit(['claudeAgent', 'claude-opus-4-6'], () => '', {
  readBlockLedger: async () => ({ version: 1, blocks: [] }),
  collectAll: async () => ({ accounts: [account], active: [], t3ObservedAt: new Date().toISOString(), blocks: [], poolSettings: {}, invalidObservations: [] }),
  collectPoolReceipts: () => ({ threads: [], runs: [], tasks: [], failures: [], transfers: [] }),
  transactLedger: operation => transactLedger(operation, directory),
  now: () => new Date(),
});`;
  try {
    const results = await Promise.all(
      Array.from(
        { length: 8 },
        () =>
          new Promise<{ code: number | null; stdout: string; stderr: string }>(
            (resolveResult) => {
              const child = spawn('bun', ['-e', script, dir], {
                cwd: packageRoot,
                env: { HOME: dir, PATH: process.env.PATH ?? '' },
                stdio: ['ignore', 'pipe', 'pipe'],
              });
              let stdout = '';
              let stderr = '';
              child.stdout
                .setEncoding('utf8')
                .on('data', (part) => (stdout += part));
              child.stderr
                .setEncoding('utf8')
                .on('data', (part) => (stderr += part));
              child.on('close', (code) =>
                resolveResult({ code, stdout, stderr })
              );
            }
          )
      )
    );
    expect(results.map((result) => result.code).sort()).toEqual([
      0, 3, 3, 3, 3, 3, 3, 3,
    ]);
    const decisions = results.map((result) => JSON.parse(result.stdout.trim()));
    expect(
      decisions.filter((result) => result.status === 'ADMIT')
    ).toHaveLength(1);
    expect(
      decisions.filter((result) =>
        result.reasons?.includes('unknown-reservation-cap')
      )
    ).toHaveLength(7);
    const ledger = await readLedger(dir);
    expect(ledger.reservations).toHaveLength(1);
    expect(
      Date.parse(ledger.reservations[0]!.expiresAt!) -
        Date.parse(ledger.reservations[0]!.createdAt)
    ).toBe(5 * 60_000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
