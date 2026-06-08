import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TuturuuuUserClient } from '../platform';
import {
  collectRepeatedFlagValues,
  createDevboxRunPayload,
  extractDevboxForwardedCommand,
  parseDurationSeconds,
  runDevboxCommand,
} from './devbox';

describe('devbox CLI helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
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
});
