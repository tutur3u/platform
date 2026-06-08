import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TuturuuuUserClient } from '../platform';
import {
  collectRepeatedFlagValues,
  createDevboxRunPayload,
  extractDevboxForwardedCommand,
  parseDurationSeconds,
  runDevboxCommand,
} from './devbox';
import { runDevboxSetup } from './devbox-setup';
import {
  type DevboxSetupCommandRunner,
  redactDevboxSetupOutput,
} from './devbox-setup-command';

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

  it('explains that agent start needs a registered runner token', async () => {
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
