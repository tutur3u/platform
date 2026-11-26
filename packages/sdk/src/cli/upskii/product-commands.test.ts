import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createCredentialStore } from '../credential-store';
import { runUpskiiCommand } from './index';

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'ttr-upskii-prod-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  process.exitCode = undefined;
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { force: true, recursive: true });
  }
});

describe('ttr external upskii P1 product & auth commands', () => {
  it('stores and inspects upskii QA credentials via stdin without echoing secret', async () => {
    const homeDir = await makeTempDir();
    const store = createCredentialStore({
      env: {},
      homeDir,
      platform: 'linux',
    });
    let previewOut = '';
    await runUpskiiCommand(
      [
        'auth',
        'login',
        '--mode',
        'qa',
        '--env',
        'staging',
        '--store',
        'file',
        '--json',
      ],
      {
        credentialStore: store,
        envVars: {},
        readStdin: async () => 'qa-super-secret-token-123456',
        write: (c) => {
          previewOut += c;
        },
      }
    );
    expect(JSON.parse(previewOut).applied).toBe(false);

    let stdout = '';
    await runUpskiiCommand(
      [
        'auth',
        'login',
        '--mode',
        'qa',
        '--env',
        'staging',
        '--store',
        'file',
        '--yes',
        '--json',
      ],
      {
        credentialStore: store,
        envVars: {},
        readStdin: async () => 'qa-super-secret-token-123456',
        write: (c) => {
          stdout += c;
        },
      }
    );
    expect(stdout).not.toContain('qa-super-secret-token-123456');
    const parsed = JSON.parse(stdout) as {
      ok: boolean;
      profile: { family: string; env: string };
    };
    expect(parsed.ok).toBe(true);
    expect(parsed.profile.family).toBe('upskii-qa');
    expect(parsed.profile.env).toBe('staging');

    let statusOut = '';
    await runUpskiiCommand(['auth', 'status', '--env', 'staging', '--json'], {
      credentialStore: store,
      envVars: {},
      write: (c) => {
        statusOut += c;
      },
    });
    expect(statusOut).not.toContain('qa-super-secret-token-123456');
    const status = JSON.parse(statusOut) as {
      profiles: Array<{ family: string; configured: boolean }>;
    };
    expect(
      status.profiles.find((p) => p.family === 'upskii-qa')?.configured
    ).toBe(true);
  });

  it('refuses secrets passed via CLI flags', async () => {
    let stderr = '';
    await runUpskiiCommand(
      ['auth', 'login', '--mode', 'qa', '--token', 'leaked-secret', '--json'],
      {
        envVars: {},
        writeErr: (c) => {
          stderr += c;
        },
      }
    );
    expect(process.exitCode).toBe(6);
    expect(stderr).toContain('SECRET_IN_CLI_FLAG');
  });

  it('previews lesson seeding without --yes and seeds + publishes edufest-workshop lessons with --yes', async () => {
    const dir = await makeTempDir();
    const stateFile = join(dir, 'teacher-state.json');
    await writeFile(
      stateFile,
      JSON.stringify({
        cookies: [
          {
            domain: 'staging.app.upskii.com',
            httpOnly: true,
            name: '__Secure-upskii.session_token',
            path: '/',
            sameSite: 'Lax',
            secure: true,
            value: 'session-cookie-secret-9999',
          },
        ],
        origins: [],
      }),
      { mode: 0o600 }
    );

    const calls: Array<{ method: string; url: string; body?: unknown }> = [];
    const mockFetch: typeof globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ body, method: init?.method ?? 'GET', url });
      if (url.endsWith('/lessons/manual')) {
        return new Response(
          JSON.stringify({ lesson: { id: `lesson-${calls.length}` } }),
          { headers: { 'Content-Type': 'application/json' }, status: 200 }
        );
      }
      if (url.endsWith('/lessons/publish')) {
        return new Response(JSON.stringify({ lesson: { published: true } }), {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
        });
      }
      return new Response('{}', { status: 200 });
    };

    let previewOut = '';
    await runUpskiiCommand(
      [
        'lessons',
        'seed',
        '--env',
        'staging',
        '--class',
        'cls-1',
        '--template',
        'edufest-workshop',
        '--run',
        'edufest-ws-01',
        '--session-file',
        stateFile,
        '--json',
      ],
      {
        envVars: {},
        fetch: mockFetch,
        write: (c) => {
          previewOut += c;
        },
      }
    );
    expect(calls).toHaveLength(0);
    expect(JSON.parse(previewOut).applied).toBe(false);

    let applyOut = '';
    await runUpskiiCommand(
      [
        'lessons',
        'seed',
        '--env',
        'staging',
        '--class',
        'cls-1',
        '--template',
        'edufest-workshop',
        '--run',
        'edufest-ws-01',
        '--session-file',
        stateFile,
        '--yes',
        '--json',
      ],
      {
        envVars: {},
        fetch: mockFetch,
        write: (c) => {
          applyOut += c;
        },
      }
    );
    expect(calls).toHaveLength(6); // 3 manual creates + 3 publishes
    const seeded = JSON.parse(applyOut) as {
      count: number;
      lessons: Array<{ title: string; published: boolean }>;
    };
    expect(seeded.count).toBe(3);
    expect(seeded.lessons[0]?.title).toContain('[QA-E2E edufest-ws-01]');
    expect(seeded.lessons.every((l) => l.published)).toBe(true);
  });

  it('verifies E3 account link, runs streaming AI chat smoke, and asserts credits delta', async () => {
    const dir = await makeTempDir();
    const stateFile = join(dir, 'state.json');
    const beforeFile = join(dir, 'credits-before.json');
    await writeFile(
      stateFile,
      JSON.stringify({
        cookies: [
          {
            domain: 'staging.app.upskii.com',
            httpOnly: true,
            name: 'upskii.session_token',
            path: '/',
            sameSite: 'Lax',
            secure: true,
            value: 'smoke-session-secret-7777',
          },
        ],
        origins: [],
      }),
      { mode: 0o600 }
    );
    await writeFile(beforeFile, JSON.stringify({ remaining: 100 }));

    const mockFetch: typeof globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/integrations/tuturuuu')) {
        return new Response(
          JSON.stringify({
            confirmed: true,
            enabled: true,
            link: { linkId: 'lnk-1', tuturuuuUserId: 'ttr-u-1' },
          }),
          { status: 200 }
        );
      }
      if (url.includes('/ai-chat') && init?.method === 'POST') {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode('data: {"delta":"Upskii AI is responsive."}\n\n')
            );
            controller.close();
          },
        });
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'x-upskii-d1-query-count': '2',
          },
          status: 200,
        });
      }
      if (url.includes('/usage/credits')) {
        return new Response(JSON.stringify({ actorId: 'u-1', remaining: 98 }), {
          status: 200,
        });
      }
      return new Response('{}', { status: 200 });
    };

    let linkOut = '';
    await runUpskiiCommand(
      [
        'link',
        'verify',
        '--env',
        'staging',
        '--session-file',
        stateFile,
        '--json',
      ],
      {
        envVars: {},
        fetch: mockFetch,
        write: (c) => {
          linkOut += c;
        },
      }
    );
    expect(JSON.parse(linkOut).verified).toBe(true);

    let smokeOut = '';
    await runUpskiiCommand(
      [
        'chat',
        'smoke',
        '--env',
        'staging',
        '--class',
        'cls-1',
        '--session-file',
        stateFile,
        '--expect-stream',
        '--max-latency-ms',
        '15000',
        '--yes',
        '--json',
      ],
      {
        envVars: {},
        fetch: mockFetch,
        write: (c) => {
          smokeOut += c;
        },
      }
    );
    const smoke = JSON.parse(smokeOut) as { ok: boolean; chunks: number };
    expect(smoke.ok).toBe(true);
    expect(smoke.chunks).toBeGreaterThan(0);

    let creditOut = '';
    await runUpskiiCommand(
      [
        'credits',
        'check',
        '--env',
        'staging',
        '--session-file',
        stateFile,
        '--min-remaining',
        '50',
        '--compare-before',
        beforeFile,
        '--json',
      ],
      {
        envVars: {},
        fetch: mockFetch,
        write: (c) => {
          creditOut += c;
        },
      }
    );
    const credit = JSON.parse(creditOut) as { ok: boolean; delta: number };
    expect(credit.ok).toBe(true);
    expect(credit.delta).toBe(-2);
  });

  it('requires Tier 2 --confirm UNLINK_UPSKII on link unlink', async () => {
    const dir = await makeTempDir();
    const stateFile = join(dir, 'state.json');
    await writeFile(
      stateFile,
      JSON.stringify({
        cookies: [
          {
            domain: 'staging.app.upskii.com',
            httpOnly: true,
            name: 'upskii.session_token',
            path: '/',
            sameSite: 'Lax',
            secure: true,
            value: 'unlink-session-secret-5555',
          },
        ],
        origins: [],
      }),
      { mode: 0o600 }
    );
    let stderr = '';
    await runUpskiiCommand(
      [
        'link',
        'unlink',
        '--env',
        'staging',
        '--session-file',
        stateFile,
        '--yes',
        '--json',
      ],
      {
        envVars: {},
        writeErr: (c) => {
          stderr += c;
        },
      }
    );
    expect(process.exitCode).toBe(6);
    expect(stderr).toContain('CONFIRMATION_REQUIRED');

    // M2 regression: prod ttr login token must NEVER be sent to web.tutur3u.com
    const seenUrls: string[] = [];
    process.exitCode = undefined;
    await runUpskiiCommand(
      [
        'link',
        'status',
        '--env',
        'staging',
        '--session-file',
        stateFile,
        '--json',
      ],
      {
        envVars: {},
        fetch: async (input) => {
          const url = typeof input === 'string' ? input : input.toString();
          seenUrls.push(url);
          return new Response(
            JSON.stringify({ confirmed: true, enabled: true, link: null }),
            { status: 200 }
          );
        },
        readConfig: async () => ({
          baseUrl: 'https://tuturuuu.com',
          session: {
            accessToken: 'prod-tuturuuu-jwt-secret-1234',
            refreshToken: 'prod-refresh',
          },
        }),
        write: () => {},
      }
    );
    expect(
      seenUrls.some((u) => new URL(u).hostname === 'web.tutur3u.com')
    ).toBe(false);

    // L2 regression: staging cookie must be rejected when targeting --env prod
    let prodErr = '';
    await runUpskiiCommand(
      [
        'credits',
        'balance',
        '--env',
        'prod',
        '--session-file',
        stateFile,
        '--json',
      ],
      {
        envVars: {},
        writeErr: (c) => {
          prodErr += c;
        },
      }
    );
    expect(process.exitCode).toBe(3);
    expect(prodErr).toContain('SESSION_COOKIE_NOT_FOUND');

    // End-to-end check: `qa session --credentials <file>` passes through runUpskiiCommand cleanly
    process.exitCode = undefined;
    const credsPath = join(dir, 'qa-creds.json');
    const outStatePath = join(dir, 'qa-out-state.json');
    await writeFile(
      credsPath,
      JSON.stringify({
        email: 'qa-fleet+e2e-01-teacher@tuturuuu.com',
        env: 'staging',
        password: 'QaPass!FixtureSecret99',
        role: 'teacher',
        runLabel: 'e2e-01',
        userId: 'usr-qa-e2e-1',
      }),
      { mode: 0o600 }
    );
    let sessionOut = '';
    let sessionErr = '';
    await runUpskiiCommand(
      [
        'qa',
        'session',
        'usr-qa-e2e-1',
        '--env',
        'staging',
        '--credentials',
        credsPath,
        '--out',
        outStatePath,
        '--yes',
        '--json',
      ],
      {
        envVars: {},
        fetch: async () => {
          const headers = new Headers({
            location: 'https://staging.app.upskii.com/',
          });
          headers.append(
            'set-cookie',
            '__Secure-upskii.session_token=sess_e2e_ok_123456; Path=/; HttpOnly; Secure; SameSite=Lax'
          );
          return new Response(null, { headers, status: 303 });
        },
        readConfig: async () => ({ baseUrl: 'https://web.tutur3u.com' }),
        write: (c) => {
          sessionOut += c;
        },
        writeErr: (c) => {
          sessionErr += c;
        },
      }
    );
    expect(sessionErr).toBe('');
    expect(process.exitCode).toBeUndefined();
    expect(JSON.parse(sessionOut).outFile).toBe(outStatePath);

    // Regression: bare cookie value leaked in response body OR D1 header is blocked
    let leakErr = '';
    await runUpskiiCommand(
      [
        'credits',
        'balance',
        '--env',
        'staging',
        '--session-file',
        stateFile,
        '--json',
      ],
      {
        envVars: {},
        fetch: async () =>
          new Response(
            JSON.stringify({ debug: 'unlink-session-secret-5555' }),
            { status: 200 }
          ),
        writeErr: (c) => {
          leakErr += c;
        },
      }
    );
    expect(process.exitCode).toBe(6);
    expect(leakErr).toContain('CREDENTIAL_LEAK_BLOCKED');

    // Regression: Unicode-escaped bare cookie value decoded by JSON.parse is also blocked
    process.exitCode = undefined;
    let unicodeLeakErr = '';
    await runUpskiiCommand(
      [
        'credits',
        'balance',
        '--env',
        'staging',
        '--session-file',
        stateFile,
        '--json',
      ],
      {
        envVars: {},
        fetch: async () =>
          new Response('{"debug":"\\u0075nlink-session-secret-5555"}', {
            status: 200,
          }),
        writeErr: (c) => {
          unicodeLeakErr += c;
        },
      }
    );
    expect(process.exitCode).toBe(6);
    expect(unicodeLeakErr).toContain('CREDENTIAL_LEAK_BLOCKED');

    // Regression: status provisioner refuses inferred prod without explicit --env prod
    process.exitCode = undefined;
    let provErr = '';
    await runUpskiiCommand(['status', 'provisioner', '--json'], {
      envVars: { TTR_ENV: 'prod' },
      readConfig: async () => ({ baseUrl: 'https://tuturuuu.com' }),
      writeErr: (c) => {
        provErr += c;
      },
    });
    expect(process.exitCode).toBe(6);
    expect(provErr).toContain('PROD_ENV_EXPLICIT_REQUIRED');
  });
});
