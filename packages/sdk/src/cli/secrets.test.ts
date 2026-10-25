import { randomBytes } from 'node:crypto';
import {
  chmod,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  runSecretsCommand,
  type SecretsDeps,
  UNKNOWN_OUTCOME_EXIT_CODE,
} from './secrets';
import {
  SECRETS_ENDPOINT,
  type SecretsCredentials,
} from './secrets-credentials';
import { OperationJournal, type SecretsJournalError } from './secrets-journal';
import { createFakeVault, jsonResponse } from './secrets-test-fixtures';

const NOW = Date.parse('2026-10-25T00:00:00Z');
const TOKEN = 'synthetic-token-BBBBBBBBBBBBBBBB';
const credentials: SecretsCredentials = {
  version: 1,
  endpoint: SECRETS_ENDPOINT,
  workspaceId: '11111111-1111-4111-8111-111111111111',
  vaultId: '22222222-2222-4222-8222-222222222222',
  token: TOKEN,
  expiresAt: '2026-10-25T01:00:00Z',
};
// Synthetic, high-entropy and binary so any leak is unmistakable.
const PLAINTEXT = Buffer.concat([
  Buffer.from('SYNTHETIC-PLAINTEXT-MARKER\u0000ÿ'),
  randomBytes(512),
]);

let dir: string;
let credentialsFile: string;
beforeEach(async () => {
  dir = await realpath(await mkdtemp(join(tmpdir(), 'ttr-secrets-cmd-')));
  credentialsFile = join(dir, 'secrets.json');
  await writeFile(credentialsFile, JSON.stringify(credentials), {
    mode: 0o600,
  });
});
afterEach(() => rm(dir, { recursive: true, force: true }));

function harness(
  vault = createFakeVault(credentials),
  extra: SecretsDeps = {}
) {
  const out: string[] = [];
  const err: string[] = [];
  const exit: number[] = [];
  let counter = 0;
  const run = (...args: string[]) =>
    runSecretsCommand([...args, '--credentials-file', credentialsFile], {
      fetch: vault.fetch,
      now: () => NOW,
      randomUUID: () =>
        `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
      stdout: (text) => out.push(text),
      stderr: (text) => err.push(text),
      setExitCode: (code) => exit.push(code),
      ...extra,
    });
  return { vault, run, out, err, exit, all: () => [...out, ...err].join('') };
}

const journalPath = () => OperationJournal.pathFor(credentialsFile);
const journalText = () => readFile(journalPath(), 'utf8').catch(() => '');

async function put(
  h: ReturnType<typeof harness>,
  name = 'api key',
  bytes = PLAINTEXT
) {
  const source = join(dir, 'source.bin');
  await writeFile(source, bytes);
  return h.run('put', name, '--from-file', source);
}

function expectNoLeak(text: string) {
  expect(text).not.toContain(TOKEN);
  expect(text).not.toContain('SYNTHETIC-PLAINTEXT-MARKER');
  expect(text).not.toContain(PLAINTEXT.toString('base64'));
  expect(text).not.toContain(PLAINTEXT.toString('base64').slice(0, 24));
  expect(text).not.toContain(PLAINTEXT.toString('hex').slice(0, 24));
}

describe('put, get and list', () => {
  it('round-trips binary data through files only', async () => {
    const h = harness();
    await put(h);
    const target = join(dir, 'restored.bin');
    await h.run('get', 'api key', '--to-file', target);
    expect((await readFile(target)).equals(PLAINTEXT)).toBe(true);
    expect((await stat(target)).mode & 0o777).toBe(0o600);
    await h.run('list');
    expect(h.out.join('')).toMatch(/[0-9a-f-]{36}\tapi key\n/);
    expect(h.exit).toEqual([]);
    expectNoLeak(h.all());
    expectNoLeak(await journalText());
  });

  it('round-trips the maximum 5 MiB value', async () => {
    const h = harness();
    const big = randomBytes(5 * 1024 * 1024);
    await put(h, 'big', big);
    const target = join(dir, 'big.out');
    await h.run('get', 'big', '--to-file', target);
    expect((await readFile(target)).equals(big)).toBe(true);
  });

  it('refuses sources over 5 MiB, empty, symlinked and special before any request', async () => {
    const h = harness();
    await writeFile(join(dir, 'big'), Buffer.alloc(5 * 1024 * 1024 + 1));
    await writeFile(join(dir, 'empty'), '');
    await writeFile(join(dir, 'real'), 'synthetic');
    await symlink(join(dir, 'real'), join(dir, 'link'));
    for (const source of ['big', 'empty', 'link', 'missing'])
      await expect(
        h.run('put', 'x', '--from-file', join(dir, source))
      ).rejects.toThrow();
    expect(h.vault.calls).toHaveLength(0);
    expect(await journalText()).toBe('');
  });

  it('protects an existing output unless --force and replaces it atomically', async () => {
    const h = harness();
    await put(h);
    const target = join(dir, 'out.bin');
    await writeFile(target, 'original', { mode: 0o644 });
    const before = h.vault.calls.length;
    await expect(h.run('get', 'api key', '--to-file', target)).rejects.toThrow(
      '--force'
    );
    expect(h.vault.calls).toHaveLength(before);
    expect(await readFile(target, 'utf8')).toBe('original');
    await h.run('get', 'api key', '--to-file', target, '--force');
    expect((await readFile(target)).equals(PLAINTEXT)).toBe(true);
    expect((await stat(target)).mode & 0o777).toBe(0o600);
  });

  it('refuses to write through a symlinked output, even with --force', async () => {
    const h = harness();
    await put(h);
    await writeFile(join(dir, 'victim'), 'victim');
    await symlink(join(dir, 'victim'), join(dir, 'out-link'));
    await expect(
      h.run('get', 'api key', '--to-file', join(dir, 'out-link'), '--force')
    ).rejects.toThrow('symbolic link');
    expect(await readFile(join(dir, 'victim'), 'utf8')).toBe('victim');
  });

  it('turns a missing secret into a safe error and writes no output file', async () => {
    const h = harness();
    const target = join(dir, 'never');
    await expect(h.run('get', 'absent', '--to-file', target)).rejects.toThrow(
      'not_found'
    );
    await expect(stat(target)).rejects.toThrow();
  });

  it('refuses an expired credential file before any request', async () => {
    const h = harness(createFakeVault(credentials), {
      now: () => NOW + 7200_000,
    });
    await expect(h.run('list')).rejects.toThrow('expired');
    expect(h.vault.calls).toHaveLength(0);
  });

  it('names the failing file kind without echoing any path', async () => {
    const h = harness();
    await rm(credentialsFile);
    await expect(h.run('list')).rejects.toThrow(
      'Credentials file: File could not be opened'
    );
    await writeFile(credentialsFile, JSON.stringify(credentials), {
      mode: 0o600,
    });
    const source = join(dir, 'missing-marker-path');
    const error = await h
      .run('put', 'x', '--from-file', source)
      .catch((e: Error) => e);
    expect((error as Error).message).toMatch(/^Source file: /);
    expect((error as Error).message).not.toContain('missing-marker-path');
    expect(h.vault.calls).toHaveLength(0);
  });

  it('refuses a group-readable credential file', async () => {
    const h = harness();
    await chmod(credentialsFile, 0o644);
    await expect(h.run('list')).rejects.toThrow('chmod 600');
    expect(h.vault.calls).toHaveLength(0);
  });

  it('rejects a loopback endpoint unless the factory injects it', async () => {
    await writeFile(
      credentialsFile,
      JSON.stringify({ ...credentials, endpoint: 'http://127.0.0.1:9' }),
      { mode: 0o600 }
    );
    const h = harness();
    await expect(h.run('list')).rejects.toThrow('permitted Passwords endpoint');
    expect(h.vault.calls).toHaveLength(0);
  });

  it('never prints a malformed or hostile server body', async () => {
    const hostile = `${PLAINTEXT.toString('base64')} ${TOKEN}`;
    const h = harness(createFakeVault(credentials), {
      fetch: (async () =>
        jsonResponse({
          ok: true,
          value: { items: [{ id: 'a', name: hostile }], revision: 1 },
        })) as unknown as typeof fetch,
    });
    await expect(h.run('list')).rejects.toThrow('could not be completed');
    expectNoLeak(h.all());
  });
});

describe('argument safety', () => {
  const secretish = [
    ['put', 'x', '--value', 'SYNTHETIC-PLAINTEXT-MARKER'],
    ['put', 'x', '--value=SYNTHETIC-PLAINTEXT-MARKER'],
    ['put', 'x', '--secret', 'SYNTHETIC-PLAINTEXT-MARKER'],
    ['list', `--token=${TOKEN}`],
    ['list', '--token', TOKEN],
    ['put', 'x', '--password', 'p'],
  ];
  it('rejects value and token flags without echoing them', async () => {
    const h = harness();
    for (const args of secretish) {
      const error = await h.run(...args).catch((e: Error) => e);
      expect((error as Error).message).toContain(
        'never accepted on the command line'
      );
      expectNoLeak((error as Error).message);
    }
    expect(h.vault.calls).toHaveLength(0);
  });

  it('rejects unknown options, extra arguments, bad names and stdout targets', async () => {
    const h = harness();
    await expect(h.run('list', '--bogus')).rejects.toThrow('Unknown option');
    await expect(h.run('list', 'extra')).rejects.toThrow('Unexpected argument');
    await expect(h.run('frobnicate')).rejects.toThrow(
      'Unknown secrets command'
    );
    await expect(h.run('put', 'bad\nname', '--from-file', 'x')).rejects.toThrow(
      'secret name'
    );
    await expect(h.run('put', '--from-file', 'x')).rejects.toThrow(
      'secret name'
    );
    await expect(h.run('put', 'x')).rejects.toThrow('--from-file');
    await expect(h.run('get', 'x')).rejects.toThrow('--to-file');
    await expect(h.run('get', 'x', '--to-file', '-')).rejects.toThrow(
      '--to-file'
    );
    await expect(h.run('get', 'x', '--to-file')).rejects.toThrow(
      'missing its value'
    );
    await expect(
      h.run('put', 'x', '--force', '--from-file', 'y')
    ).rejects.toThrow('Unknown option');
    expect(h.vault.calls).toHaveLength(0);
  });

  it('prints help without touching credentials', async () => {
    const out: string[] = [];
    await runSecretsCommand(['--help'], { stdout: (text) => out.push(text) });
    expect(out.join('')).toContain(
      'ttr secrets put <name> --from-file'.replace('ttr secrets put', 'put')
    );
  });
});

describe('unknown write outcome', () => {
  it('journals a write whose response was lost, blocks replay and reconciles it', async () => {
    const h = harness();
    h.vault.hooks.afterCommit = (call) =>
      call.action === 'put' ? 'drop' : undefined;
    await put(h);
    expect(h.exit).toEqual([UNKNOWN_OUTCOME_EXIT_CODE]);
    const originalId = h.vault.calls[0]?.requestId as string;
    expect(h.err.join('')).toContain(`UNKNOWN`);
    expect(h.err.join('')).toContain(originalId);
    expect(h.vault.items.has('api key')).toBe(true);

    const journal = JSON.parse(await journalText());
    expect(journal.entries).toEqual([
      expect.objectContaining({
        requestId: originalId,
        action: 'put',
        name: 'api key',
        state: 'unknown',
      }),
    ]);
    expect(Object.keys(journal.entries[0]).sort()).toEqual(
      [
        'action',
        'name',
        'requestId',
        'startedAt',
        'state',
        'vaultId',
        'workspaceId',
      ].sort()
    );
    expectNoLeak(await journalText());
    expect((await stat(journalPath())).mode & 0o777).toBe(0o600);

    // Every further write is refused locally; only the original put was sent.
    h.vault.hooks.afterCommit = undefined;
    const sent = h.vault.calls.length;
    await expect(put(h)).rejects.toThrow('unresolved outcome');
    await expect(h.run('rotate')).rejects.toThrow(originalId);
    expect(h.vault.calls).toHaveLength(sent);

    // Reads are unaffected.
    await h.run('list');

    // Reconcile queries only request.status for the original id.
    await h.run('reconcile');
    const status = h.vault.calls.at(-1);
    expect(status?.action).toBe('request.status');
    expect(status?.body.targetRequestId).toBe(originalId);
    expect(h.out.join('')).toContain(`COMMITTED put api key (${originalId})`);
    expect(h.vault.writes()).toHaveLength(1);
    expect(JSON.parse(await journalText()).entries).toEqual([]);
    expectNoLeak(h.all());

    // Block is lifted: a new write goes out under a new request id.
    await put(h);
    expect(h.vault.writes()).toHaveLength(2);
    expect(h.vault.writes()[1]?.requestId).not.toBe(originalId);
  });

  it('treats a lost request as unknown too and never invents an outcome', async () => {
    const h = harness();
    h.vault.hooks.beforeCommit = () => 'drop';
    await h.run('rotate');
    expect(h.exit).toEqual([UNKNOWN_OUTCOME_EXIT_CODE]);
    h.vault.hooks.beforeCommit = undefined;
    await h.run('reconcile');
    expect(h.out.join('')).toMatch(/UNKNOWN rotate .*no record/);
    expect(h.exit.at(-1)).toBe(UNKNOWN_OUTCOME_EXIT_CODE);
    expect(h.vault.writes()).toHaveLength(1);
    await expect(h.run('rotate')).rejects.toThrow('unresolved outcome');
  });

  it('keeps the original uncertain when reconcile itself is refused or fails', async () => {
    const h = harness();
    h.vault.hooks.afterCommit = (call) =>
      call.action === 'rotate' ? 'drop' : undefined;
    await h.run('rotate');
    h.vault.hooks.beforeCommit = (call) =>
      call.action === 'request.status'
        ? jsonResponse(
            { ok: false, code: 'rate_limited', retryAfterSeconds: 5 },
            429
          )
        : undefined;
    await h.run('reconcile');
    expect(h.out.join('')).toContain('UNKNOWN rotate');
    expect(h.out.join('')).toContain('rate_limited');
    h.vault.hooks.beforeCommit = (call) =>
      call.action === 'request.status' ? 'drop' : undefined;
    await h.run('reconcile');
    expect(h.exit.filter((c) => c === UNKNOWN_OUTCOME_EXIT_CODE)).toHaveLength(
      3
    );
    await expect(h.run('rotate')).rejects.toThrow('unresolved outcome');
    expect(h.vault.writes()).toHaveLength(1);
  });

  it('does not resolve on a mismatched action in the receipt', async () => {
    const h = harness();
    h.vault.hooks.afterCommit = (call) =>
      call.action === 'rotate' ? 'drop' : undefined;
    await h.run('rotate');
    const [id] = [...h.vault.receipts.keys()];
    h.vault.receipts.set(id as string, { action: 'put', revision: 1 });
    h.vault.hooks.afterCommit = undefined;
    await h.run('reconcile');
    expect(h.out.join('')).toContain('different action');
    expect(JSON.parse(await journalText()).entries).toHaveLength(1);
  });

  it('only resolves a definitive rejection of the write itself', async () => {
    const h = harness();
    h.vault.hooks.beforeCommit = () =>
      jsonResponse({ ok: false, code: 'quota_exceeded' }, 403);
    await expect(h.run('rotate')).rejects.toThrow('quota_exceeded');
    expect(JSON.parse(await journalText()).entries).toEqual([]);
    h.vault.hooks.beforeCommit = () =>
      jsonResponse({ ok: false, code: 'internal' }, 500);
    await h.run('rotate');
    expect(h.exit).toEqual([UNKNOWN_OUTCOME_EXIT_CODE]);
  });

  it('treats a leftover pending entry from a crash as unresolved', async () => {
    const h = harness();
    await new OperationJournal(journalPath()).begin({
      requestId: '44444444-4444-4444-8444-444444444444',
      action: 'put',
      name: 'crashed',
      workspaceId: credentials.workspaceId,
      vaultId: credentials.vaultId,
      startedAt: new Date(NOW).toISOString(),
    });
    await expect(h.run('rotate')).rejects.toThrow(
      '44444444-4444-4444-8444-444444444444'
    );
    expect(h.vault.calls).toHaveLength(0);
  });

  it('fails closed on a corrupt or world-readable journal and sends nothing', async () => {
    const h = harness();
    await writeFile(journalPath(), '{ not json', { mode: 0o600 });
    await expect(h.run('rotate')).rejects.toThrow('unreadable');
    await writeFile(journalPath(), '{"version":1,"entries":[]}', {
      mode: 0o600,
    });
    await chmod(journalPath(), 0o644);
    await expect(h.run('rotate')).rejects.toThrow('unreadable');
    expect(h.vault.calls).toHaveLength(0);
  });

  it('scopes journals to the vault and refuses abandonment of an unknown write', async () => {
    const h = harness();
    h.vault.hooks.afterCommit = (call) =>
      call.action === 'rotate' ? 'drop' : undefined;
    await h.run('rotate');
    const journal = new OperationJournal(journalPath());
    const [entry] = await journal.unresolved(
      credentials.workspaceId,
      credentials.vaultId
    );
    expect(
      await journal.unresolved(
        credentials.workspaceId,
        '55555555-5555-4555-8555-555555555555'
      )
    ).toEqual([]);
    const sent = h.vault.calls.length;
    await expect(
      h.run('reconcile', '--abandon', entry!.requestId)
    ).rejects.toThrow();
    expect(h.vault.calls).toHaveLength(sent);
    expect(
      await journal.unresolved(credentials.workspaceId, credentials.vaultId)
    ).toEqual([entry]);
  });

  it('serialises concurrent writers so only one reaches the server', async () => {
    const journal = new OperationJournal(journalPath());
    const attempt = (requestId: string) =>
      journal.begin({
        requestId,
        action: 'rotate',
        workspaceId: credentials.workspaceId,
        vaultId: credentials.vaultId,
        startedAt: new Date(NOW).toISOString(),
      });
    const results = await Promise.allSettled([
      attempt('77777777-7777-4777-8777-777777777777'),
      attempt('88888888-8888-4888-8888-888888888888'),
      attempt('99999999-9999-4999-8999-999999999999'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    for (const rejected of results.filter((r) => r.status === 'rejected'))
      expect(
        ((rejected as PromiseRejectedResult).reason as SecretsJournalError)
          .reason
      ).toBe('blocked');
  });
});
