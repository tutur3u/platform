import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TuturuuuUserClient } from '../platform';
import {
  collectRepeatedFlagValues,
  createDevboxBuildPayload,
  createDevboxRunPayload,
  createDevboxServePayload,
  createDevboxTunnelPayload,
  extractDevboxForwardedCommand,
  parseDurationSeconds,
  runDevboxCommand,
} from './devbox';
import { executeDevboxAgentJob } from './devbox-runner';
import { runDevboxSetup } from './devbox-setup';
import {
  type DevboxSetupCommandRunner,
  redactDevboxSetupOutput,
} from './devbox-setup-command';

vi.mock('./devbox-agent-capabilities', () => ({
  createDevboxAgentCapabilities: vi.fn(async () => ({
    cli: { name: 'ttr', version: '0.2.0' },
    os: { arch: 'arm64', platform: 'darwin', release: '25.0.0' },
    resources: {
      cpu: { cores: 10, model: 'Apple' },
      loadAverage: [1, 2, 3],
      memory: { freeBytes: 1024, totalBytes: 2048 },
      uptimeSeconds: 120,
    },
    runtimes: { bun: '1.3.14', node: 'v26.0.0' },
    tools: { docker: 'Docker version 29.0.0', git: 'git version 2.54.0' },
  })),
}));

const doctorOk = {
  containerized: true as const,
  missingTools: [],
  packageManager: null,
  setupCommands: [],
  status: 'ok' as const,
  tools: {
    bun: '1.3.14',
    docker: 'Docker version 28.0.0',
    git: 'git version 2.50.0',
    node: 'v24.0.0',
  },
};

describe('devbox CLI helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('extracts commands after -- without treating command flags as CLI flags', () => {
    expect(
      extractDevboxForwardedCommand([
        'box',
        'run',
        '--keep',
        '--',
        'bun',
        '--cwd',
        'packages/sdk',
        'test',
      ])
    ).toEqual(['bun', '--cwd', 'packages/sdk', 'test']);
  });

  it('falls back to positional command syntax for compact use', () => {
    expect(
      extractDevboxForwardedCommand(['box', 'run', 'bun', 'check'])
    ).toEqual(['bun', 'check']);
  });

  it('collects repeated --env values from raw argv', () => {
    expect(
      collectRepeatedFlagValues(
        ['box', 'run', '--env', 'A=1', '--env=B=2', '--', 'bun', 'check'],
        'env'
      )
    ).toEqual(['A=1', 'B=2']);
  });

  it.each([
    ['90', 90],
    ['2m', 120],
    ['1h', 3600],
  ])('parses duration %s', (input, expected) => {
    expect(parseDurationSeconds(input)).toBe(expected);
  });

  it('creates an auto-lease run payload for remote Bun commands', () => {
    expect(
      createDevboxRunPayload({
        argv: [
          'box',
          'run',
          '--keep',
          '--reuse',
          '--timeout',
          '2m',
          '--preview-port',
          '7803',
          '--env',
          'DATABASE_URL=postgres://remote',
          '--env-file',
          '.env.remote',
          '--',
          'bun',
          'sb:reset',
        ],
        flags: {
          keep: true,
          reuse: true,
          timeout: '2m',
          'preview-port': '7803',
          'env-file': '.env.remote',
        },
      })
    ).toEqual({
      command: ['bun', 'sb:reset'],
      env: {
        DATABASE_URL: 'postgres://remote',
      },
      envFiles: ['.env.remote'],
      keep: true,
      leaseMode: 'auto',
      previewPorts: [7803],
      reuse: true,
      timeoutSeconds: 120,
    });
  });

  it('can forward DATABASE_URL from a local env var into a remote run', () => {
    vi.stubEnv('REMOTE_DEVBOX_DATABASE_URL', 'postgres://remote-db');

    expect(
      createDevboxRunPayload({
        argv: [
          'box',
          'run',
          '--database-url-env',
          'REMOTE_DEVBOX_DATABASE_URL',
          '--',
          'bun',
          'check',
        ],
        flags: {
          'database-url-env': 'REMOTE_DEVBOX_DATABASE_URL',
        },
      })
    ).toMatchObject({
      command: ['bun', 'check'],
      env: {
        DATABASE_URL: 'postgres://remote-db',
      },
    });
  });

  it('queues package build commands on devboxes', () => {
    const payload = createDevboxBuildPayload({
      argv: ['box', 'build', '--cwd', 'apps/web'],
      flags: { cwd: 'apps/web' },
    });

    expect(payload).toMatchObject({
      command: ['bun', 'run', '--cwd', 'apps/web', 'build'],
      keep: false,
      leaseMode: 'auto',
      previewPorts: [],
    });
    expect(payload).not.toHaveProperty('timeoutSeconds');
  });

  it('creates a kept serve payload with cloudflared and forwarded database env', () => {
    vi.stubEnv('DEVBOX_DATABASE_URL', 'postgres://devbox-db');
    vi.stubEnv('DEVBOX_CLOUDFLARED_TOKEN', 'cloudflare-secret-token');

    const payload = createDevboxServePayload({
      argv: ['box', 'serve'],
      flags: {
        cloudflared: true,
        'cloudflared-token-env': 'DEVBOX_CLOUDFLARED_TOKEN',
        'database-url-env': 'DEVBOX_DATABASE_URL',
      },
    });
    const script = payload.command[2] ?? '';

    expect(payload).toMatchObject({
      env: {
        CLOUDFLARED_TOKEN: 'cloudflare-secret-token',
        DATABASE_URL: 'postgres://devbox-db',
      },
      keep: true,
      leaseMode: 'auto',
      previewPorts: [7803],
    });
    expect(payload).not.toHaveProperty('timeoutSeconds');
    expect(payload.command.slice(0, 2)).toEqual(['bash', '-c']);
    expect(script).toContain("bun run --cwd 'apps/web' build");
    expect(script).toContain("PORT=7803 bun run --cwd 'apps/web' start:app");
    expect(script).toContain('cloudflare/cloudflared:latest');
    expect(script).toContain('$CLOUDFLARED_TOKEN');
    expect(script).not.toContain('cloudflare-secret-token');
  });

  it('queues dockerized cloudflared tunnel runs with token env only', () => {
    vi.stubEnv('DEVBOX_CLOUDFLARED_TOKEN', 'cloudflare-secret-token');

    const payload = createDevboxTunnelPayload({
      argv: ['box', 'tunnel'],
      flags: { 'cloudflared-token-env': 'DEVBOX_CLOUDFLARED_TOKEN' },
    });
    const script = payload.command[2] ?? '';

    expect(payload).toMatchObject({
      env: {
        CLOUDFLARED_TOKEN: 'cloudflare-secret-token',
      },
      keep: true,
      leaseMode: 'auto',
      previewPorts: [],
    });
    expect(payload).not.toHaveProperty('timeoutSeconds');
    expect(script).toContain('docker run --rm --network host');
    expect(script).toContain('cloudflare/cloudflared:latest');
    expect(script).toContain('$CLOUDFLARED_TOKEN');
    expect(script).not.toContain('cloudflare-secret-token');
  });

  it('requires cloudflared tunnel tokens to come from local env vars', () => {
    expect(() =>
      createDevboxTunnelPayload({
        argv: ['box', 'tunnel'],
        flags: {},
      })
    ).toThrow('Cloudflared tunnel runs require');
  });

  it('explains that agent start needs a registered runner token', async () => {
    vi.stubEnv('TUTURUUU_DEVBOX_RUNNER_TOKEN', '');

    await expect(
      runDevboxCommand({
        action: 'agent',
        argv: ['box', 'agent', 'start'],
        baseUrl: 'http://localhost:7903',
        flags: { once: true },
        json: false,
      })
    ).rejects.toThrow('Run `ttr box agent register` with a logged-in account');
  });

  it('explains that shutdown needs a registered runner token', async () => {
    vi.stubEnv('TUTURUUU_DEVBOX_RUNNER_TOKEN', '');

    await expect(
      runDevboxCommand({
        action: 'shutdown',
        argv: ['box', 'shutdown'],
        baseUrl: 'http://localhost:7903',
        flags: {},
        json: false,
      })
    ).rejects.toThrow('Run `ttr box agent register` with a logged-in account');
  });

  it('shuts down the current runner without a logged-in user client', async () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'Devbox runner removed from the cluster.',
          runner: { id: 'runner-1', status: 'revoked' },
        })
      )
    );

    await runDevboxCommand({
      action: 'shutdown',
      argv: ['box', 'shutdown'],
      baseUrl: 'http://localhost:7903',
      flags: { token: 'runner-token' },
      json: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://localhost:7903/api/v1/devboxes/agents/shutdown'
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { 'X-Devbox-Runner-Token': 'runner-token' },
      method: 'POST',
    });
    expect(write).toHaveBeenCalledWith(
      'Devbox runner removed from the cluster.\n'
    );
  });

  it('fails agent start when heartbeat rejects the runner token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        statusText: 'Unauthorized',
      })
    );

    await expect(
      runDevboxCommand({
        action: 'agent',
        argv: ['box', 'agent', 'start'],
        baseUrl: 'http://localhost:7903',
        flags: { once: true, token: 'invalid' },
        json: false,
      })
    ).rejects.toThrow('Devbox agent heartbeat failed: 401 Unauthorized');
  });

  it('runs one heartbeat and poll cycle for one-shot agents', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ jobs: [] })));

    await runDevboxCommand({
      action: 'agent',
      argv: ['box', 'agent', 'start'],
      baseUrl: 'http://localhost:7903',
      flags: { once: true, token: 'runner-token' },
      json: false,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      '/api/v1/devboxes/agents/heartbeat'
    );
    expect(
      JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit)?.body))
    ).toMatchObject({
      capabilities: {
        cli: { name: 'ttr', version: '0.2.0' },
        runtimes: { bun: '1.3.14', node: 'v26.0.0' },
      },
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      '/api/v1/devboxes/agents/poll'
    );
  });

  it('waits for queued devbox runs to complete before printing logs', async () => {
    vi.useFakeTimers();
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const client = {
      devboxes: {
        createRun: vi.fn().mockResolvedValue({
          lease: { id: 'lease-1', status: 'active' },
          run: {
            command: ['bun', '--version'],
            exitCode: null,
            id: 'run-1',
            status: 'queued',
          },
        }),
        getRun: vi.fn().mockResolvedValue({
          logs: ['remote$ bun --version', '1.3.14'],
          run: {
            command: ['bun', '--version'],
            exitCode: 0,
            id: 'run-1',
            status: 'succeeded',
          },
        }),
      },
    } as unknown as TuturuuuUserClient;

    const run = runDevboxCommand({
      action: 'run',
      argv: ['box', 'run', '--', 'bun', '--version'],
      client,
      flags: {},
      json: false,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await run;

    expect(client.devboxes.getRun).toHaveBeenCalledWith('run-1');
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('Devbox run run-1 succeeded')
    );
    expect(write).toHaveBeenCalledWith('remote$ bun --version\n');
    expect(write).toHaveBeenCalledWith('1.3.14\n');
  });

  it('queues CLI upgrades as remote devbox runs', async () => {
    const client = {
      devboxes: {
        createRun: vi.fn().mockResolvedValue({
          logs: ['remote$ bun i -g tuturuuu', 'updated'],
          run: {
            command: ['bun', 'i', '-g', 'tuturuuu'],
            exitCode: 0,
            id: 'run-upgrade',
            status: 'succeeded',
          },
        }),
      },
    } as unknown as TuturuuuUserClient;

    await runDevboxCommand({
      action: 'upgrade',
      argv: ['box', 'upgrade'],
      client,
      flags: { runner: 'runner-1', timeout: '2m' },
      json: true,
    });

    expect(client.devboxes.createRun).toHaveBeenCalledWith({
      command: ['bun', 'i', '-g', 'tuturuuu'],
      keep: false,
      leaseMode: 'auto',
      runnerId: 'runner-1',
      timeoutSeconds: 120,
    });
  });

  it('does not wait for serve runs unless requested', async () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    const client = {
      devboxes: {
        createRun: vi.fn().mockResolvedValue({
          lease: { id: 'lease-serve', status: 'active' },
          run: {
            command: ['bash', '-lc', 'serve'],
            exitCode: null,
            id: 'run-serve',
            status: 'queued',
          },
        }),
        getRun: vi.fn(),
      },
    } as unknown as TuturuuuUserClient;

    await runDevboxCommand({
      action: 'serve',
      argv: ['box', 'serve'],
      client,
      flags: {},
      json: false,
    });

    expect(client.devboxes.getRun).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('Use `ttr box logs run-serve`')
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('ttr box preview --lease lease-serve --port 7803')
    );
  });

  it('executes claimed jobs in one-shot agents', async () => {
    const eventPayloads: unknown[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/v1/devboxes/agents/heartbeat')) {
        return new Response(JSON.stringify({ ok: true }));
      }
      if (url.includes('/api/v1/devboxes/agents/poll')) {
        return new Response(
          JSON.stringify({
            jobs: [
              {
                command: [
                  process.execPath,
                  '-e',
                  'process.stdout.write("agent-ok")',
                ],
                leaseId: 'lease-1',
                runId: 'run-1',
                timeoutSeconds: 10,
              },
            ],
          })
        );
      }
      if (url.includes('/api/v1/devboxes/agents/events')) {
        eventPayloads.push(
          JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}'))
        );
        return new Response(JSON.stringify({ ok: true }));
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await runDevboxCommand({
      action: 'agent',
      argv: ['box', 'agent', 'start'],
      baseUrl: 'http://localhost:7903',
      flags: { once: true, token: 'runner-token' },
      json: false,
    });

    expect(eventPayloads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          events: [
            expect.objectContaining({
              message: expect.stringContaining('remote$'),
            }),
          ],
          runId: 'run-1',
        }),
        expect.objectContaining({
          completion: { exitCode: 0, status: 'succeeded' },
          runId: 'run-1',
        }),
      ])
    );
    expect(JSON.stringify(eventPayloads)).toContain('agent-ok');
  });

  it('redacts explicit job env values from the remote command event', async () => {
    const eventPayloads: unknown[] = [];
    const fetchMock = vi.fn(
      async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        eventPayloads.push(
          JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}'))
        );
        return new Response(JSON.stringify({ ok: true }));
      }
    );

    const result = await executeDevboxAgentJob(
      {
        command: [
          process.execPath,
          '-e',
          'process.stdout.write("secret-redacted")',
          'sensitive-command-secret',
        ],
        env: { SECRET_TOKEN: 'sensitive-command-secret' },
        envFiles: [],
        leaseId: 'lease-secret',
        runId: 'run-secret',
        timeoutSeconds: 10,
      },
      {
        baseUrl: 'http://localhost:7903',
        env: {
          HOME: tmpdir(),
          PATH: process.env.PATH,
        },
        fetch: fetchMock as unknown as typeof fetch,
        token: 'runner-token',
      }
    );
    const serializedEvents = JSON.stringify(eventPayloads);

    expect(result).toEqual({ exitCode: 0, status: 'succeeded' });
    expect(serializedEvents).toContain('remote$');
    expect(serializedEvents).toContain('[REDACTED]');
    expect(serializedEvents).toContain('secret-redacted');
    expect(serializedEvents).not.toContain('sensitive-command-secret');
  });

  it('does not leak ambient agent env into claimed jobs', async () => {
    const eventPayloads: unknown[] = [];
    const fetchMock = vi.fn(
      async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
        eventPayloads.push(
          JSON.parse(String((init as RequestInit | undefined)?.body ?? '{}'))
        );
        return new Response(JSON.stringify({ ok: true }));
      }
    );

    const result = await executeDevboxAgentJob(
      {
        command: [
          process.execPath,
          '-e',
          [
            'const blocked = [',
            "'NEXT_PUBLIC_TURNSTILE_SITE_KEY',",
            "'TUTURUUU_DEVBOX_RUNNER_TOKEN'",
            '].filter((name) => process.env[name]);',
            'if (blocked.length || process.env.EXPLICIT_JOB_ENV !== "expected") {',
            'process.stderr.write(JSON.stringify({ blocked, explicit: process.env.EXPLICIT_JOB_ENV ?? null }));',
            'process.exit(1);',
            '}',
            'process.stdout.write("env-isolated");',
          ].join(''),
        ],
        env: { EXPLICIT_JOB_ENV: 'expected' },
        envFiles: [],
        leaseId: 'lease-env',
        runId: 'run-env',
        timeoutSeconds: 10,
      },
      {
        baseUrl: 'http://localhost:7903',
        env: {
          HOME: tmpdir(),
          NEXT_PUBLIC_TURNSTILE_SITE_KEY: 'site-key',
          PATH: process.env.PATH,
          TUTURUUU_DEVBOX_RUNNER_TOKEN: 'runner-token',
        },
        fetch: fetchMock as unknown as typeof fetch,
        token: 'runner-token',
      }
    );

    const serializedEvents = JSON.stringify(eventPayloads);

    expect(result).toEqual({ exitCode: 0, status: 'succeeded' });
    expect(serializedEvents).toContain('env-isolated');
    expect(serializedEvents).not.toContain('site-key');
    expect(serializedEvents).not.toContain('runner-token');
  });

  it('redacts Supabase setup keys from streamed command output', () => {
    const boxSeparator = '\u2502';
    const output = [
      'API URL: http://127.0.0.1:8001',
      'DB URL: postgresql://postgres:postgres@127.0.0.1:8002/postgres',
      'anon key: eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature',
      'service_role key: sb_secret_superlocal',
      'Publishable key | sb_publishable_superlocal',
      'S3 Access Key: local-access-key',
      `${boxSeparator} URL ${boxSeparator} postgresql://postgres:postgres@127.0.0.1:8002/postgres ${boxSeparator}`,
      `${boxSeparator} Access Key ${boxSeparator} 625729a08b95bf1b7ff351a663f3a23c ${boxSeparator}`,
      `${boxSeparator} Secret Key ${boxSeparator} 850181e4652dd023b7a98c58ae0d2d34bd ${boxSeparator}`,
    ].join('\n');

    const redacted = redactDevboxSetupOutput(output);

    expect(redacted).toContain('API URL: http://127.0.0.1:8001');
    expect(redacted).toContain('DB URL: [REDACTED]');
    expect(redacted).toContain('anon key: [REDACTED]');
    expect(redacted).toContain('service_role key: [REDACTED]');
    expect(redacted).toContain('Publishable key | [REDACTED]');
    expect(redacted).toContain('S3 Access Key: [REDACTED]');
    expect(redacted).toContain(
      `${boxSeparator} URL ${boxSeparator} [REDACTED] ${boxSeparator}`
    );
    expect(redacted).toContain(
      `${boxSeparator} Access Key ${boxSeparator} [REDACTED] ${boxSeparator}`
    );
    expect(redacted).toContain(
      `${boxSeparator} Secret Key ${boxSeparator} [REDACTED] ${boxSeparator}`
    );
    expect(redacted).not.toContain('postgres:postgres');
    expect(redacted).not.toContain('sb_secret_superlocal');
    expect(redacted).not.toContain('sb_publishable_superlocal');
    expect(redacted).not.toContain('signature');
    expect(redacted).not.toContain('local-access-key');
    expect(redacted).not.toContain('625729a08b95bf1b7ff351a663f3a23c');
    expect(redacted).not.toContain('850181e4652dd023b7a98c58ae0d2d34bd');
  });

  it('bootstraps a missing platform checkout and reports redacted setup output', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'ttr-devbox-setup-'));
    const checkoutDir = join(tempRoot, 'tuturuuu');
    const commands: string[] = [];
    const stdout: string[] = [];
    const runCommand: DevboxSetupCommandRunner = async (
      command,
      args,
      options
    ) => {
      commands.push(`${command} ${args.join(' ')}`);

      if (command === 'git' && args[0] === 'clone') {
        await mkdir(join(checkoutDir, 'apps', 'database'), {
          recursive: true,
        });
        await mkdir(join(checkoutDir, 'apps', 'web'), { recursive: true });
        await writeFile(
          join(checkoutDir, 'apps', 'web', '.env.example'),
          [
            'NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_URL',
            'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY',
            'SUPABASE_SECRET_KEY=YOUR_SUPABASE_SECRET_KEY',
          ].join('\n')
        );
        await mkdir(join(checkoutDir, 'apps', 'chat'), { recursive: true });
        await writeFile(
          join(checkoutDir, 'apps', 'chat', '.env.local'),
          [
            'NEXT_PUBLIC_SUPABASE_URL=https://old.example',
            'CHAT_ONLY=value',
          ].join('\n')
        );
        return { code: 0, stderr: '', stdout: '' };
      }

      if (command === 'bun' && args.join(' ') === 'install --frozen-lockfile') {
        expect(options.cwd).toBe(checkoutDir);
        return { code: 0, stderr: '', stdout: '' };
      }

      if (command === 'bun' && args.join(' ') === 'sb:start') {
        expect(options.cwd).toBe(checkoutDir);
        expect(options.redactOutput).toBe(true);
        return { code: 0, stderr: '', stdout: '' };
      }

      if (command === 'bun' && args.join(' ') === 'supabase status -o json') {
        expect(options.capture).toBe(true);
        expect(options.cwd).toBe(join(checkoutDir, 'apps', 'database'));
        return {
          code: 0,
          stderr: '',
          stdout: JSON.stringify({
            'API URL': 'http://127.0.0.1:8001',
            'DB URL': 'postgresql://postgres:postgres@127.0.0.1:8002/postgres',
            'anon key': 'anon-local',
            'service_role key': 'service-local',
            'Studio URL': 'http://127.0.0.1:8003',
          }),
        };
      }

      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    };

    const report = await runDevboxSetup({
      dir: checkoutDir,
      doctorReport: doctorOk,
      json: true,
      runCommand,
      stdout: (value) => stdout.push(value),
    });

    expect(report.status).toBe('ok');
    expect(report).toMatchObject({
      checkout: {
        path: checkoutDir,
        status: 'cloned',
      },
    });
    expect(commands).toEqual([
      `git clone https://github.com/tutur3u/platform.git ${checkoutDir}`,
      'bun install --frozen-lockfile',
      'bun sb:start',
      'bun supabase status -o json',
    ]);
    await expect(
      readFile(join(checkoutDir, 'apps', 'web', '.env.local'), 'utf8')
    ).resolves.toContain('SUPABASE_SECRET_KEY=service-local');
    await expect(
      readFile(join(checkoutDir, 'apps', 'chat', '.env.local'), 'utf8')
    ).resolves.toContain('CHAT_ONLY=value');
    expect(stdout.join('')).toContain('[REDACTED]');
    expect(stdout.join('')).not.toContain('anon-local');
    expect(stdout.join('')).not.toContain('service-local');

    await rm(tempRoot, { force: true, recursive: true });
  });
});
