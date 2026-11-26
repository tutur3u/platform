import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLI_EXIT, CliError } from '../cli-contracts';
import type { CliEnv } from '../cli-env';
import { runUpskiiQaCommand, type UpskiiQaLedger } from './qa-command';

const PROVISIONER_TOKEN = 'qa-prov-token-secret-9876543210';
const CREATED_PASSWORD = 'QaPass!SuperSecretValue99';
const SESSION_COOKIE_VALUE = 'sess_tok_secret_abcdef0123456789';
const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ttr-upskii-qa-bundle-'));
  tempDirs.push(dir);
  return dir;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

function signInRedirectResponse(): Response {
  const headers = new Headers({ location: 'https://staging.app.upskii.com/' });
  headers.append(
    'set-cookie',
    `__Secure-upskii.session_token=${SESSION_COOKIE_VALUE}; Path=/; HttpOnly; Secure; SameSite=Lax`
  );
  return new Response(null, { headers, status: 303 });
}

async function runQa(
  args: string[],
  opts: { env?: CliEnv; explicitEnvFlag?: boolean; fetch?: typeof fetch } = {}
): Promise<string> {
  let output = '';
  await runUpskiiQaCommand({
    args,
    env: opts.env ?? 'staging',
    explicitEnvFlag: opts.explicitEnvFlag ?? false,
    fetch: opts.fetch,
    json: true,
    resolveQaToken: async () => PROVISIONER_TOKEN,
    write: (chunk) => {
      output += chunk;
    },
  });
  return output;
}

async function expectCliError(
  promise: Promise<unknown>,
  code: string,
  exitCode: number
): Promise<void> {
  try {
    await promise;
    expect.unreachable(`Expected CliError(${code})`);
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    expect((error as CliError).code).toBe(code);
    expect((error as CliError).exitCode).toBe(exitCode);
  }
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { force: true, recursive: true });
  }
});

describe('ttr external upskii qa bundle & teardown security', () => {
  it('runs bundle create and teardown with confirmation, authoritative QA checks, and H1 containment', async () => {
    const dir = await makeTempDir();
    const bundleDir = join(dir, 'bundle-run');
    const purgeCalls: Array<{ mode: string; userId: string }> = [];
    let counter = 0;

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/admin/qa/users') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body));
          counter += 1;
          return jsonResponse(
            {
              user: {
                email: `qa-fleet+${body.runLabel}-${body.role}@tuturuuu.com`,
                password: `${CREATED_PASSWORD}-${counter}`,
                role: body.role,
                runLabel: body.runLabel,
                userId: `usr-${body.role}-${counter}`,
              },
            },
            201
          );
        }
        if (url.endsWith('/api/auth/password') && init?.method === 'POST') {
          return signInRedirectResponse();
        }
        if (
          /\/api\/admin\/qa\/users\/usr-teacher-1$/u.test(url) &&
          init?.method === 'GET'
        ) {
          return jsonResponse({
            user: {
              email: 'qa-fleet+bundle-e2e-teacher@tuturuuu.com',
              role: 'teacher',
              runLabel: 'bundle-e2e',
              userId: 'usr-teacher-1',
            },
          });
        }
        if (
          /\/api\/admin\/qa\/users\/usr-student-2$/u.test(url) &&
          init?.method === 'GET'
        ) {
          return jsonResponse({
            user: {
              email: 'qa-fleet+bundle-e2e-student@tuturuuu.com',
              role: 'student',
              runLabel: 'bundle-e2e',
              userId: 'usr-student-2',
            },
          });
        }
        if (
          /\/api\/admin\/qa\/users\/usr-teacher-1$/u.test(url) &&
          init?.method === 'POST'
        ) {
          return jsonResponse({
            classId: 'cls-bundle-77',
            outcome: 'seeded',
            userId: 'usr-teacher-1',
          });
        }
        const purgeMatch = /\/api\/admin\/qa\/users\/([^/]+)\/purge$/u.exec(
          url
        );
        if (purgeMatch?.[1] && init?.method === 'POST') {
          const body = JSON.parse(String(init.body));
          purgeCalls.push({ mode: body.mode, userId: purgeMatch[1] });
          return jsonResponse({
            counts: { classes: body.mode === 'verify' ? 0 : 1 },
            purge: { clean: true },
          });
        }
        return jsonResponse({ error: 'unexpected' }, 404);
      }
    );
    const fetch = fetchMock as unknown as typeof fetch;

    const bundleOut = await runQa(
      [
        'bundle',
        'create',
        '--run',
        'bundle-e2e',
        '--teachers',
        '1',
        '--students',
        '1',
        '--seed-class',
        '--ttl',
        '30m',
        '--out-dir',
        bundleDir,
        '--yes',
      ],
      { fetch }
    );
    expect(bundleOut).not.toContain(CREATED_PASSWORD);
    expect(bundleOut).not.toContain(SESSION_COOKIE_VALUE);

    const ledgerPath = join(bundleDir, 'ledger.json');
    expect((await stat(ledgerPath)).mode & 0o777).toBe(0o600);
    const ledger = JSON.parse(
      await readFile(ledgerPath, 'utf8')
    ) as UpskiiQaLedger;
    expect(ledger.seedClassId).toBe('cls-bundle-77');
    expect(ledger.users).toHaveLength(2);

    await expectCliError(
      runQa(
        [
          'bundle',
          'teardown',
          '--ledger',
          ledgerPath,
          '--mode',
          'apply',
          '--yes',
        ],
        { fetch }
      ),
      'CONFIRMATION_REQUIRED',
      CLI_EXIT.policy
    );

    const teardownOut = await runQa(
      [
        'bundle',
        'teardown',
        '--ledger',
        ledgerPath,
        '--mode',
        'apply',
        '--yes',
        '--confirm',
        'bundle-e2e',
      ],
      { fetch }
    );
    expect(purgeCalls).toEqual([
      { mode: 'apply', userId: 'usr-teacher-1' },
      { mode: 'verify', userId: 'usr-teacher-1' },
      { mode: 'apply', userId: 'usr-student-2' },
      { mode: 'verify', userId: 'usr-student-2' },
    ]);
    const deletedFiles = JSON.parse(teardownOut).deletedFiles as string[];
    expect(deletedFiles).toHaveLength(4);
    for (const file of deletedFiles) await expect(stat(file)).rejects.toThrow();

    // H1 regression: crafted ledger pointing at an outside file MUST be refused.
    const outsideVictim = join(dir, 'id_ed25519');
    await writeFile(outsideVictim, 'precious-key\n', { mode: 0o600 });
    const craftedLedger = join(bundleDir, 'crafted-ledger.json');
    await writeFile(
      craftedLedger,
      JSON.stringify({
        createdAt: new Date().toISOString(),
        env: 'staging',
        origins: {
          admin: 'https://staging.admin.upskii.com',
          app: 'https://staging.app.upskii.com',
          auth: 'https://staging.upskii.com',
        },
        runLabel: 'crafted-run',
        seedClassId: null,
        storageStatePaths: { 'teacher-1': outsideVictim },
        ttlSeconds: 3600,
        users: [],
        version: 1,
      }),
      { mode: 0o600 }
    );
    await expectCliError(
      runQa(
        [
          'bundle',
          'teardown',
          '--ledger',
          craftedLedger,
          '--mode',
          'apply',
          '--yes',
          '--confirm',
          'crafted-run',
        ],
        { fetch }
      ),
      'UNSAFE_TEARDOWN_PATH',
      CLI_EXIT.policy
    );
    expect(await readFile(outsideVictim, 'utf8')).toBe('precious-key\n');
  });
});
