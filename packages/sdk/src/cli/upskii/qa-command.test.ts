import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CLI_EXIT, CliError } from '../cli-contracts';
import type { CliEnv } from '../cli-env';
import {
  assertSafeResponseText,
  buildTraceHeaders,
  buildUpskiiUrl,
  extractD1Telemetry,
  formatQaMarker,
  isUpskiiQaEmail,
  readCookieFromStorageState,
  upskiiCookieToStorageState,
  upskiiFetchJson,
} from './http';
import {
  parseQaTtlSeconds,
  runUpskiiQaCommand,
  upskiiQaHelp,
} from './qa-command';

const PROVISIONER_TOKEN = 'qa-prov-token-secret-9876543210';
const CREATED_PASSWORD = 'QaPass!SuperSecretValue99';
const SESSION_COOKIE_VALUE = 'sess_tok_secret_abcdef0123456789';
const tempDirs: string[] = [];

async function makeTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'ttr-upskii-qa-test-'));
  tempDirs.push(dir);
  return dir;
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...headers },
    status,
  });
}

function signInRedirectResponse(
  cookieName = '__Secure-upskii.session_token'
): Response {
  const headers = new Headers({ location: 'https://staging.app.upskii.com/' });
  headers.append(
    'set-cookie',
    `${cookieName}=${SESSION_COOKIE_VALUE}; Path=/; HttpOnly; Secure; SameSite=Lax`
  );
  return new Response(null, { headers, status: 303 });
}

async function runQa(
  args: string[],
  opts: {
    env?: CliEnv;
    explicitEnvFlag?: boolean;
    fetch?: typeof fetch;
    json?: boolean;
    resolveQaToken?: () => Promise<string>;
  } = {}
): Promise<string> {
  let output = '';
  await runUpskiiQaCommand({
    args,
    env: opts.env ?? 'staging',
    explicitEnvFlag: opts.explicitEnvFlag ?? false,
    fetch: opts.fetch,
    json: opts.json ?? true,
    resolveQaToken: opts.resolveQaToken ?? (async () => PROVISIONER_TOKEN),
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
): Promise<CliError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    const cliError = error as CliError;
    expect(cliError.code).toBe(code);
    expect(cliError.exitCode).toBe(exitCode);
    return cliError;
  }
  throw new Error(`Expected CliError(${code}, ${exitCode}) but resolved`);
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) await rm(dir, { force: true, recursive: true });
  }
});

describe('upskii http helpers', () => {
  it('validates QA emails, markers, URLs, trace headers, D1 telemetry, and cookies', () => {
    expect(isUpskiiQaEmail('qa-fleet+teacher@tuturuuu.com')).toBe(true);
    expect(isUpskiiQaEmail('qa-fleet+smoke-01-student@tuturuuu.com')).toBe(
      true
    );
    expect(isUpskiiQaEmail('real-user@tuturuuu.com')).toBe(false);
    expect(formatQaMarker('smoke-01', 'Algebra Class')).toBe(
      '[QA-E2E smoke-01] Algebra Class'
    );
    expect(
      buildUpskiiUrl('https://staging.admin.upskii.com', '/api/admin/qa/users')
    ).toBe('https://staging.admin.upskii.com/api/admin/qa/users');
    expect(() =>
      buildUpskiiUrl('https://staging.admin.upskii.com', '//evil.example/x')
    ).toThrow(CliError);
    expect(() =>
      buildUpskiiUrl('https://staging.admin.upskii.com', 'https://evil.example')
    ).toThrow(CliError);

    const trace = buildTraceHeaders('external upskii qa', 'staging', 'e2e');
    expect(trace['X-TTR-Env']).toBe('staging');
    expect(trace['X-TTR-Reason']).toBe('e2e');
    expect(trace['X-TTR-Request-Id']).toMatch(/^[0-9a-f-]{36}$/u);

    const headers = new Headers({
      'x-upskii-d1-queries': '4',
      'x-other': 'ignored',
    });
    expect(extractD1Telemetry(headers)).toEqual({ 'x-upskii-d1-queries': '4' });

    const prodState = upskiiCookieToStorageState(
      `__Secure-upskii.session_token=${SESSION_COOKIE_VALUE}`,
      'https://staging.app.upskii.com'
    );
    expect(prodState.cookies[0]?.domain).toBe('staging.app.upskii.com');
    expect(prodState.cookies[0]?.secure).toBe(true);

    const localState = upskiiCookieToStorageState(
      `upskii.session_token=${SESSION_COOKIE_VALUE}`,
      'http://localhost:3001'
    );
    expect(localState.cookies[0]?.domain).toBe('localhost');
    expect(localState.cookies[0]?.secure).toBe(false);
  });

  it('blocks credential leaks and maps HTTP status codes to structured CliErrors', async () => {
    expect(() =>
      assertSafeResponseText(`echo ${PROVISIONER_TOKEN}`, [PROVISIONER_TOKEN])
    ).toThrow(CliError);

    const leakFetch = vi.fn(async () =>
      jsonResponse({ debug: PROVISIONER_TOKEN }, 500)
    );
    await expectCliError(
      upskiiFetchJson({
        fetch: leakFetch as unknown as typeof fetch,
        label: 'leak test',
        origin: 'https://staging.admin.upskii.com',
        path: '/api/admin/qa/users',
        secrets: [PROVISIONER_TOKEN],
      }),
      'CREDENTIAL_LEAK_BLOCKED',
      CLI_EXIT.policy
    );

    const statusCases: Array<[number, number]> = [
      [401, CLI_EXIT.auth],
      [404, CLI_EXIT.notFound],
      [409, CLI_EXIT.conflict],
      [503, CLI_EXIT.unavailable],
    ];
    for (const [status, expectedExit] of statusCases) {
      const f = vi.fn(async () => jsonResponse({ code: 'ERR' }, status));
      try {
        await upskiiFetchJson({
          fetch: f as unknown as typeof fetch,
          label: `status-${status}`,
          origin: 'https://staging.admin.upskii.com',
          path: '/api/admin/qa/users',
        });
        throw new Error('should have thrown');
      } catch (err) {
        expect((err as CliError).exitCode).toBe(expectedExit);
      }
    }
  });
});

describe('upskii qa command', () => {
  it('parses TTLs, prints help, and enforces explicit --env prod guard', async () => {
    expect(parseQaTtlSeconds(undefined)).toBe(7200);
    expect(parseQaTtlSeconds('15m')).toBe(900);
    expect(parseQaTtlSeconds('2h')).toBe(7200);
    expect(parseQaTtlSeconds('300s')).toBe(300);
    expect(() => parseQaTtlSeconds('30s')).toThrow(CliError);
    expect(() => parseQaTtlSeconds('3h')).toThrow(CliError);
    expect(upskiiQaHelp()).toContain('bundle create');

    const fetchMock = vi.fn(async () =>
      jsonResponse({ more: false, users: [] })
    );
    await expectCliError(
      runQa(['users', 'list'], {
        env: 'prod',
        explicitEnvFlag: false,
        fetch: fetchMock as unknown as typeof fetch,
      }),
      'PROD_ENV_EXPLICIT_REQUIRED',
      CLI_EXIT.policy
    );
    expect(fetchMock).not.toHaveBeenCalled();

    const stagingOut = await runQa(['users', 'list'], {
      env: 'staging',
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(JSON.parse(stagingOut).env).toBe('staging');
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'https://staging.admin.upskii.com/api/admin/qa/users'
    );

    await runQa(['users', 'list'], {
      env: 'prod',
      explicitEnvFlag: true,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      'https://admin.upskii.com/api/admin/qa/users'
    );
  });

  it('refuses --token and --password CLI flags before touching token resolver', async () => {
    const resolveQaToken = vi.fn(async () => PROVISIONER_TOKEN);
    await expectCliError(
      runQa(['users', 'list', '--token', PROVISIONER_TOKEN], {
        resolveQaToken,
      }),
      'SECRET_IN_CLI_FLAG',
      CLI_EXIT.policy
    );
    await expectCliError(
      runQa(['users', 'create', '--password=secret', '--run', 'smoke-01'], {
        resolveQaToken,
      }),
      'SECRET_IN_CLI_FLAG',
      CLI_EXIT.policy
    );
    expect(resolveQaToken).not.toHaveBeenCalled();
  });

  it('previews users create without --yes and writes 0600 credentials without echoing password', async () => {
    const dir = await makeTempDir();
    const outDir = join(dir, 'creds-out');
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          user: {
            email: 'qa-fleet+smoke-01-teacher@tuturuuu.com',
            password: CREATED_PASSWORD,
            role: 'teacher',
            runLabel: 'smoke-01',
            userId: 'usr-teacher-1',
          },
        },
        201
      )
    );
    const resolveQaToken = vi.fn(async () => PROVISIONER_TOKEN);

    const previewOut = await runQa(
      [
        'users',
        'create',
        '--run',
        'smoke-01',
        '--role',
        'teacher',
        '--ttl',
        '15m',
        '--out-dir',
        outDir,
      ],
      { fetch: fetchMock as unknown as typeof fetch, resolveQaToken }
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(resolveQaToken).not.toHaveBeenCalled();
    expect(JSON.parse(previewOut).mode).toBe('preview');

    const createOut = await runQa(
      [
        'users',
        'create',
        '--run',
        'smoke-01',
        '--role',
        'teacher',
        '--ttl',
        '15m',
        '--out-dir',
        outDir,
        '--yes',
      ],
      { fetch: fetchMock as unknown as typeof fetch, resolveQaToken }
    );
    expect(createOut).not.toContain(CREATED_PASSWORD);
    const payload = JSON.parse(createOut);
    expect(payload.user.password).toBeUndefined();
    expect((await stat(outDir)).mode & 0o777).toBe(0o700);
    expect((await stat(payload.credentialsFile)).mode & 0o777).toBe(0o600);
    expect(
      JSON.parse(await readFile(payload.credentialsFile, 'utf8')).password
    ).toBe(CREATED_PASSWORD);
  });

  it('supports users disable/purge confirm guards, seed-class, and 0600 session storageState', async () => {
    const dir = await makeTempDir();
    const storagePath = join(dir, 'teacher.storage-state.json');

    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/api/admin/qa/users') && init?.method === 'POST') {
          return jsonResponse(
            {
              user: {
                email: 'qa-fleet+smoke-02-teacher@tuturuuu.com',
                password: CREATED_PASSWORD,
                role: 'teacher',
                userId: 'usr-t-2',
              },
            },
            201
          );
        }
        if (
          url.endsWith('/api/admin/qa/users/usr-t-2') &&
          init?.method === 'POST'
        ) {
          return jsonResponse({
            classId: 'cls-qa-101',
            outcome: 'seeded',
            userId: 'usr-t-2',
          });
        }
        if (
          url.endsWith('/api/admin/qa/users/usr-t-2') &&
          init?.method === 'GET'
        ) {
          return jsonResponse({
            user: {
              email: 'qa-fleet+smoke-02-teacher@tuturuuu.com',
              role: 'teacher',
              runLabel: 'smoke-02',
              userId: 'usr-t-2',
            },
          });
        }
        if (
          url.endsWith('/api/admin/qa/users/usr-t-2') &&
          init?.method === 'DELETE'
        ) {
          return jsonResponse({ outcome: 'disabled' });
        }
        if (
          url.endsWith('/api/admin/qa/users/usr-t-2/purge') &&
          init?.method === 'POST'
        ) {
          return jsonResponse({
            counts: { classes: 1 },
            purge: { clean: true },
          });
        }
        if (url.endsWith('/api/auth/password') && init?.method === 'POST') {
          expect(init.redirect).toBe('manual');
          return signInRedirectResponse();
        }
        return jsonResponse({ error: 'unexpected' }, 404);
      }
    );
    const fetch = fetchMock as unknown as typeof fetch;

    const seedOut = await runQa(['seed-class', 'usr-t-2', '--yes'], { fetch });
    expect(JSON.parse(seedOut).classId).toBe('cls-qa-101');

    const createOut = await runQa(
      [
        'users',
        'create',
        '--run',
        'smoke-02',
        '--role',
        'teacher',
        '--out-dir',
        dir,
        '--yes',
      ],
      { fetch }
    );
    const credsPath = JSON.parse(createOut).credentialsFile as string;

    const sessionPreview = await runQa(
      [
        'session',
        'usr-t-2',
        '--credentials',
        credsPath,
        '--format',
        'storage-state',
        '--out',
        storagePath,
      ],
      { fetch }
    );
    expect(JSON.parse(sessionPreview).mode).toBe('preview');

    const sessionDryRun = await runQa(
      [
        'session',
        'usr-t-2',
        '--credentials',
        credsPath,
        '--format',
        'storage-state',
        '--out',
        storagePath,
        '--yes',
        '--dry-run',
      ],
      { fetch }
    );
    expect(JSON.parse(sessionDryRun).mode).toBe('preview');

    const sessionOut = await runQa(
      [
        'session',
        'usr-t-2',
        '--credentials',
        credsPath,
        '--format',
        'storage-state',
        '--out',
        storagePath,
        '--yes',
      ],
      { fetch }
    );
    expect(sessionOut).not.toContain(SESSION_COOKIE_VALUE);
    expect(sessionOut).not.toContain(CREATED_PASSWORD);
    expect((await stat(storagePath)).mode & 0o777).toBe(0o600);
    expect(await readCookieFromStorageState(storagePath)).toBe(
      `__Secure-upskii.session_token=${SESSION_COOKIE_VALUE}`
    );

    await expectCliError(
      runQa(['users', 'disable', 'usr-t-2', '--yes'], { fetch }),
      'CONFIRMATION_REQUIRED',
      CLI_EXIT.policy
    );
    const disableOut = await runQa(
      ['users', 'disable', 'usr-t-2', '--yes', '--confirm', 'usr-t-2'],
      { fetch }
    );
    expect(JSON.parse(disableOut).disabled).toBe(true);

    const purgeLocalPreview = await runQa(
      ['users', 'purge', 'usr-t-2', '--mode', 'dry-run'],
      { fetch }
    );
    expect(JSON.parse(purgeLocalPreview).mode).toBe('preview');

    const purgeDryOut = await runQa(
      ['users', 'purge', 'usr-t-2', '--mode', 'dry-run', '--yes'],
      { fetch }
    );
    expect(JSON.parse(purgeDryOut).mode).toBe('dry-run');
    await expectCliError(
      runQa(['users', 'purge', 'usr-t-2', '--mode', 'apply', '--yes'], {
        fetch,
      }),
      'CONFIRMATION_REQUIRED',
      CLI_EXIT.policy
    );
  });

  it('supports sweep dry-run, apply confirmation guard, pagination, and leak refusal', async () => {
    const purgedIds: string[] = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.pathname === '/api/admin/qa/users' && init?.method === 'GET') {
          if (!url.searchParams.get('cursor')) {
            return jsonResponse({
              more: true,
              nextCursor: 'page-2',
              users: [
                {
                  email: 'qa-fleet+old-run-teacher@tuturuuu.com',
                  role: 'teacher',
                  userId: 'usr-old-1',
                },
              ],
            });
          }
          return jsonResponse({
            more: false,
            users: [
              {
                email: 'qa-fleet+old-run-student@tuturuuu.com',
                role: 'student',
                userId: 'usr-old-2',
              },
            ],
          });
        }
        const purgeMatch = /\/api\/admin\/qa\/users\/([^/]+)\/purge$/u.exec(
          url.pathname
        );
        if (purgeMatch?.[1] && init?.method === 'POST') {
          purgedIds.push(purgeMatch[1]);
          return jsonResponse({ counts: { users: 1 }, purge: { clean: true } });
        }
        return jsonResponse({}, 404);
      }
    );
    const fetch = fetchMock as unknown as typeof fetch;

    const dryRun = JSON.parse(
      await runQa(['sweep', '--expired', '--dry-run'], { fetch })
    );
    expect(dryRun.mode).toBe('dry-run');
    expect(dryRun.pages).toBe(2);
    expect(dryRun.matchedCount).toBe(2);
    expect(purgedIds).toEqual([]);

    await expectCliError(
      runQa(['sweep', '--expired', '--yes'], { fetch }),
      'CONFIRMATION_REQUIRED',
      CLI_EXIT.policy
    );

    const applied = JSON.parse(
      await runQa(
        ['sweep', '--expired', '--yes', '--confirm', 'SWEEP_UPSKII_QA'],
        { fetch }
      )
    );
    expect(applied.mode).toBe('apply');
    expect(applied.purgedCount).toBe(2);
    expect(purgedIds).toEqual(['usr-old-1', 'usr-old-2']);

    const leakyFetch = vi.fn(async () =>
      jsonResponse({ error: `leaked ${PROVISIONER_TOKEN}` }, 200)
    );
    await expectCliError(
      runQa(['users', 'list'], {
        fetch: leakyFetch as unknown as typeof fetch,
      }),
      'CREDENTIAL_LEAK_BLOCKED',
      CLI_EXIT.policy
    );
  });
});
