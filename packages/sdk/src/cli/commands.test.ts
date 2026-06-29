import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import packageJson from '../../package.json';
import {
  getTaskClosePayload,
  getTaskDonePayload,
  getTaskUpdatePayload,
  listTasksForCli,
  normalizeLabelColor,
  runCli,
} from './commands';

describe('CLI commands', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it.each(['-v', '--version'])('prints version for %s', async (flag) => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli([flag]);

    expect(write).toHaveBeenCalledWith(`${packageJson.version}\n`);
  });

  it('prints version even when update checks are disabled', async () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(['--version', '--no-update-check']);

    expect(write).toHaveBeenCalledWith(`${packageJson.version}\n`);
  });

  it('does not treat forwarded command version flags as global CLI flags', async () => {
    vi.stubEnv(
      'TUTURUUU_CONFIG',
      '/tmp/tuturuuu-cli-devbox-forwarded-version-test/config.json'
    );
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await expect(
      runCli(['box', 'run', '--no-update-check', '--', 'bun', '--version'])
    ).rejects.toThrow('Not logged in. Run `ttr login` first.');

    expect(write).not.toHaveBeenCalledWith(`${packageJson.version}\n`);
  });

  it('accepts devbox as an alias for box run commands', async () => {
    vi.stubEnv(
      'TUTURUUU_CONFIG',
      '/tmp/tuturuuu-cli-devbox-alias-test/config.json'
    );

    await expect(
      runCli(['devbox', 'run', '--no-update-check', '--', 'bun', '--version'])
    ).rejects.toThrow('Not logged in. Run `ttr login` first.');
  });

  it('normalizes task label color names to backend hex values', () => {
    expect(normalizeLabelColor()).toBe('#6B7280');
    expect(normalizeLabelColor('red')).toBe('#DC2626');
    expect(normalizeLabelColor('#0D9488')).toBe('#0D9488');
  });

  async function writeTestConfig(config: Record<string, unknown>) {
    const dir = await mkdtemp(join(tmpdir(), 'tuturuuu-cli-test-'));
    const path = join(dir, 'config.json');
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`);
    vi.stubEnv('TUTURUUU_CONFIG', path);
    return path;
  }

  const walletIdA = '11111111-1111-4111-8111-111111111111';
  const walletIdB = '22222222-2222-4222-8222-222222222222';
  const checkpointId = '33333333-3333-4333-8333-333333333333';

  it('switches hosts and clears saved session context when the origin changes', async () => {
    const configPath = await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentBoardId: 'board-1',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli([
      'host',
      'use',
      'local',
      '--port',
      '7803',
      '--no-update-check',
    ]);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('Host set to http://localhost:7803')
    );
    await expect(
      readFile(configPath, 'utf8').then(JSON.parse)
    ).resolves.toEqual({
      baseUrl: 'http://localhost:7803',
    });
  });

  it('prints the current host without requiring login', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.localhost',
    });
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(['host', 'current', '--json', '--no-update-check']);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('"baseUrl": "https://tuturuuu.localhost"')
    );
  });

  it('fetches wallet balance through the current workspace wallet read', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        id: 'wallet-1',
        name: 'Cash',
        balance: 1250,
        currency: 'USD',
      })
    );
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCli([
      'finance',
      'wallets',
      'balance',
      'wallet-1',
      '--json',
      '--no-update-check',
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/workspaces/ws-1/wallets/wallet-1',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
  });

  it('fetches all wallet balances from the fresh wallet list', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json([
        {
          id: 'wallet-1',
          name: 'Cash',
          balance: 100,
          currency: 'USD',
        },
        {
          id: 'wallet-2',
          name: 'Savings',
          balance: 50,
          currency: 'USD',
        },
      ])
    );
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli([
      'finance',
      'wallets',
      'balance',
      '--all',
      '--json',
      '--no-update-check',
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/v1/workspaces/ws-1/wallets',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('"balance": 150')
    );
  });

  it('runs task search with a positional query through the search API', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'team-ws',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json([
          { id: 'team-ws', name: 'Team', personal: false },
          { id: 'personal-ws', name: 'Personal', personal: true },
        ])
      )
      .mockResolvedValueOnce(
        Response.json({
          tasks: [
            { id: 'task-2', name: 'Second ranked', similarity: 0.7 },
            { id: 'task-1', name: 'First ranked', similarity: 0.9 },
          ],
        })
      );
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli([
      'tasks',
      'search',
      'deadline',
      'review',
      '--json',
      '--no-update-check',
    ]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://tuturuuu.com/api/v1/workspaces/personal-ws/tasks/search',
      expect.objectContaining({
        body: JSON.stringify({
          mode: 'hybrid',
          query: 'deadline review',
        }),
        method: 'POST',
      })
    );
    const output = write.mock.calls.map(([value]) => String(value)).join('');
    expect(output.indexOf('"id": "task-2"')).toBeLessThan(
      output.indexOf('"id": "task-1"')
    );
  });

  it('maps task search flags to mode match count and threshold', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'personal',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json([{ id: 'team-ws', name: 'Team', personal: false }])
      )
      .mockResolvedValueOnce(Response.json({ tasks: [] }));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCli([
      'tasks',
      'search',
      '--query',
      'deadline review',
      '--mode',
      'semantic',
      '--limit',
      '7',
      '--threshold',
      '0.4',
      '--workspace',
      'team-ws',
      '--json',
      '--no-update-check',
    ]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://tuturuuu.com/api/v1/workspaces/team-ws/tasks/search',
      expect.objectContaining({
        body: JSON.stringify({
          matchCount: 7,
          matchThreshold: 0.4,
          mode: 'semantic',
          query: 'deadline review',
        }),
        method: 'POST',
      })
    );
  });

  it('creates wallet checkpoints with timezone-normalized checked_at values', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        actual_balance: 123.45,
        checked_at: '2026-06-10T17:00:00.000Z',
        id: checkpointId,
        wallet_id: walletIdA,
      })
    );
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCli([
      'finance',
      'checkpoints',
      'create',
      '--wallet',
      walletIdA,
      '--actual-balance',
      '123.45',
      '--checked-at',
      '2026-06-11',
      '--timezone',
      'Asia/Ho_Chi_Minh',
      '--note',
      'Monthly audit',
      '--json',
      '--no-update-check',
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://tuturuuu.com/api/workspaces/ws-1/wallets/${walletIdA}/checkpoints`,
      expect.objectContaining({
        body: JSON.stringify({
          actual_balance: 123.45,
          checked_at: '2026-06-10T17:00:00.000Z',
          note: 'Monthly audit',
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });

  it('creates all-wallet checkpoint batches from balances pairs', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        data: [],
        totals_by_currency: [],
      })
    );
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCli([
      'finance',
      'checkpoints',
      'batch',
      '--checked-at',
      '2026-06-11',
      '--timezone',
      'Asia/Ho_Chi_Minh',
      '--balances',
      `${walletIdA}=100.1,${walletIdB}=-25`,
      '--note',
      'Quick total check',
      '--json',
      '--no-update-check',
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/workspaces/ws-1/wallets/checkpoints',
      expect.objectContaining({
        body: JSON.stringify({
          checked_at: '2026-06-10T17:00:00.000Z',
          entries: [
            {
              actual_balance: 100.1,
              note: 'Quick total check',
              wallet_id: walletIdA,
            },
            {
              actual_balance: -25,
              note: 'Quick total check',
              wallet_id: walletIdB,
            },
          ],
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });

  it('routes checkpoint list, get, update, delete, and summary commands', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const checkpoint = {
      actual_balance: 100,
      checked_at: '2026-06-11T00:00:00.000Z',
      currency: 'USD',
      id: checkpointId,
      ledger_balance: 98,
      wallet_id: walletIdA,
    };
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({ data: [checkpoint], intervals: [], latest: checkpoint })
      )
      .mockResolvedValueOnce(
        Response.json({ data: [checkpoint], intervals: [], latest: checkpoint })
      )
      .mockResolvedValueOnce(
        Response.json({ ...checkpoint, actual_balance: 101 })
      )
      .mockResolvedValueOnce(Response.json({ message: 'Checkpoint deleted' }))
      .mockResolvedValueOnce(
        Response.json({
          latest_checkpoints: [checkpoint],
          totals_by_currency: [],
          wallets: [],
        })
      );
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCli([
      'finance',
      'checkpoints',
      'list',
      '--wallet',
      walletIdA,
      '--limit',
      '10',
      '--json',
      '--no-update-check',
    ]);
    await runCli([
      'finance',
      'checkpoints',
      'get',
      checkpointId,
      '--wallet',
      walletIdA,
      '--json',
      '--no-update-check',
    ]);
    await runCli([
      'finance',
      'checkpoints',
      'update',
      checkpointId,
      '--wallet',
      walletIdA,
      '--amount',
      '101',
      '--json',
      '--no-update-check',
    ]);
    await runCli([
      'finance',
      'checkpoints',
      'delete',
      checkpointId,
      '--wallet',
      walletIdA,
      '--json',
      '--no-update-check',
    ]);
    await runCli([
      'finance',
      'checkpoints',
      'summary',
      '--json',
      '--no-update-check',
    ]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `https://tuturuuu.com/api/workspaces/ws-1/wallets/${walletIdA}/checkpoints?limit=10`,
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `https://tuturuuu.com/api/workspaces/ws-1/wallets/${walletIdA}/checkpoints`,
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      `https://tuturuuu.com/api/workspaces/ws-1/wallets/${walletIdA}/checkpoints/${checkpointId}`,
      expect.objectContaining({
        body: JSON.stringify({ actual_balance: 101 }),
        cache: 'no-store',
        method: 'PATCH',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      `https://tuturuuu.com/api/workspaces/ws-1/wallets/${walletIdA}/checkpoints/${checkpointId}`,
      expect.objectContaining({
        cache: 'no-store',
        method: 'DELETE',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      5,
      'https://tuturuuu.com/api/workspaces/ws-1/wallets/checkpoints',
      expect.objectContaining({ cache: 'no-store' })
    );
  });

  it('normalizes finance transaction create dates in the requested timezone', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ id: 'tx-1' }));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCli([
      'finance',
      'transactions',
      'create',
      '--amount',
      '150000',
      '--wallet',
      'wallet-1',
      '--taken-at',
      '2026-05-09',
      '--timezone',
      'Asia/Ho_Chi_Minh',
      '--json',
      '--no-update-check',
    ]);

    const request = fetchMock.mock.calls[0];
    expect(request?.[0]).toBe(
      'https://tuturuuu.com/api/workspaces/ws-1/transactions'
    );
    expect(request?.[1]).toEqual(
      expect.objectContaining({
        cache: 'no-store',
        method: 'POST',
      })
    );
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      amount: 150000,
      origin_wallet_id: 'wallet-1',
      taken_at: '2026-05-08T17:00:00.000Z',
      tag_ids: [],
    });
  });

  it('normalizes finance transaction update local date-times in the user timezone', async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      calendar: 'gregory',
      locale: 'en',
      numberingSystem: 'latn',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ id: 'tx-1' }));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCli([
      'finance',
      'transactions',
      'update',
      'tx-1',
      '--taken-at',
      '2026-05-09T13:45',
      '--json',
      '--no-update-check',
    ]);

    const request = fetchMock.mock.calls[0];
    expect(request?.[0]).toBe(
      'https://tuturuuu.com/api/workspaces/ws-1/transactions/tx-1'
    );
    expect(request?.[1]).toEqual(
      expect.objectContaining({
        cache: 'no-store',
        method: 'PUT',
      })
    );
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      taken_at: '2026-05-09T06:45:00.000Z',
      tag_ids: [],
    });
  });

  it('builds transfer migration payloads from CLI flags', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ message: 'success' }));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCli([
      'finance',
      'transfers',
      'migrate',
      '--from-transaction',
      'origin-tx',
      '--to-transaction',
      'destination-tx',
      '--from-wallet',
      'origin-wallet',
      '--to-wallet',
      'destination-wallet',
      '--amount',
      '25',
      '--destination-amount',
      '26',
      '--taken-at',
      '2026-03-30T08:00:00.000Z',
      '--description',
      'Migrated transfer',
      '--tags',
      'tag-1,tag-2',
      '--json',
      '--no-update-check',
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/workspaces/ws-1/transfers',
      expect.objectContaining({
        body: JSON.stringify({
          origin_wallet_id: 'origin-wallet',
          destination_wallet_id: 'destination-wallet',
          amount: 25,
          destination_amount: 26,
          description: 'Migrated transfer',
          taken_at: '2026-03-30T08:00:00.000Z',
          tag_ids: ['tag-1', 'tag-2'],
          origin_transaction_id: 'origin-tx',
          destination_transaction_id: 'destination-tx',
        }),
        cache: 'no-store',
        method: 'PATCH',
      })
    );
  });

  it('builds category description payloads from CLI flags', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ message: 'success' }));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCli([
      'finance',
      'categories',
      'create',
      'Travel',
      '--expense',
      '--description',
      'Trips and commuting',
      '--color',
      'blue',
      '--json',
      '--no-update-check',
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/workspaces/ws-1/transactions/categories',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Travel',
          color: 'blue',
          description: 'Trips and commuting',
          is_expense: true,
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });

  it('builds tag create payloads from CLI flags', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ id: 'tag-1' }));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCli([
      'finance',
      'tags',
      'create',
      'Tuturuuu',
      '--color',
      '#9ef0ff',
      '--description',
      'Platform costs',
      '--json',
      '--no-update-check',
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/workspaces/ws-1/tags',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'Tuturuuu',
          color: '#9ef0ff',
          description: 'Platform costs',
        }),
        cache: 'no-store',
        method: 'POST',
      })
    );
  });

  it('builds tag update payloads from CLI flags', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ message: 'success' }));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCli([
      'finance',
      'tags',
      'update',
      'tag-1',
      '--description',
      'Investment platform costs',
      '--json',
      '--no-update-check',
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/workspaces/ws-1/tags/tag-1',
      expect.objectContaining({
        body: JSON.stringify({
          description: 'Investment platform costs',
        }),
        cache: 'no-store',
        method: 'PUT',
      })
    );
  });

  it('routes tag list, get, and delete CLI commands', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json([
          {
            id: 'tag-1',
            name: 'Tuturuuu',
          },
        ])
      )
      .mockResolvedValueOnce(
        Response.json({
          id: 'tag-1',
          name: 'Tuturuuu',
        })
      )
      .mockResolvedValueOnce(Response.json({ message: 'success' }));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCli(['finance', 'tags', 'list', '--json', '--no-update-check']);
    await runCli([
      'finance',
      'tags',
      'get',
      'tag-1',
      '--json',
      '--no-update-check',
    ]);
    await runCli([
      'finance',
      'tags',
      'delete',
      'tag-1',
      '--json',
      '--no-update-check',
    ]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://tuturuuu.com/api/workspaces/ws-1/tags',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://tuturuuu.com/api/workspaces/ws-1/tags/tag-1',
      expect.objectContaining({
        cache: 'no-store',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'https://tuturuuu.com/api/workspaces/ws-1/tags/tag-1',
      expect.objectContaining({
        cache: 'no-store',
        method: 'DELETE',
      })
    );
  });

  it('builds calendar event create payloads from ISO start and duration', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ id: 'event-1' }));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCli([
      'calendar',
      'events',
      'create',
      'Focus block',
      '--start',
      '2026-06-11T09:00:00+07:00',
      '--duration-minutes',
      '90',
      '--locked',
      'true',
      '--json',
      '--no-update-check',
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/v1/workspaces/ws-1/calendar/events',
      expect.objectContaining({
        body: JSON.stringify({
          title: 'Focus block',
          locked: true,
          start_at: '2026-06-11T02:00:00.000Z',
          end_at: '2026-06-11T03:30:00.000Z',
        }),
        method: 'POST',
      })
    );
  });

  it('rejects calendar event create commands with both end and duration', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });

    await expect(
      runCli([
        'calendar',
        'events',
        'create',
        'Focus block',
        '--start',
        '2026-06-11T09:00:00Z',
        '--end',
        '2026-06-11T10:00:00Z',
        '--duration-minutes',
        '90',
        '--no-update-check',
      ])
    ).rejects.toThrow('Use either --end or --duration-minutes, not both.');
  });

  it('guards destructive calendar reset unless --yes is present', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });

    await expect(
      runCli(['calendar', 'calendars', 'reset', '--no-update-check'])
    ).rejects.toThrow('Calendar reset is destructive. Re-run with --yes.');
  });

  it('routes calendar reset with explicit confirmation', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ success: true }));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCli([
      'calendar',
      'calendars',
      'reset',
      '--yes',
      '--json',
      '--no-update-check',
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/v1/workspaces/ws-1/calendars/reset',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });

  it('prints calendar provider auth URLs', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ authUrl: 'https://accounts.example.test/oauth' })
    );
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(['calendar', 'auth', 'google', '--no-update-check']);

    expect(write).toHaveBeenCalledWith('https://accounts.example.test/oauth\n');
  });

  it('builds calendar connection create payloads from CLI flags', async () => {
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ id: 'connection-1' }));
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCli([
      'calendar',
      'connections',
      'create',
      '--calendar-id',
      'primary',
      '--calendar-name',
      'Primary',
      '--account',
      'account-1',
      '--enabled',
      'true',
      '--json',
      '--no-update-check',
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/v1/calendar/connections',
      expect.objectContaining({
        body: JSON.stringify({
          calendarId: 'primary',
          calendarName: 'Primary',
          authTokenId: 'account-1',
          isEnabled: true,
          wsId: 'ws-1',
        }),
        method: 'POST',
      })
    );
  });

  it.each([
    ['--help'],
    ['-h'],
    ['help'],
  ])('prints global help for %s', async (...args) => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(args);

    expect(write).toHaveBeenCalledWith(expect.stringContaining('Scoped help:'));
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('ttr tasks --help')
    );
    expect(write).toHaveBeenCalledWith(expect.stringContaining('  upgrade'));
  });

  it.each([
    ['upgrade', '--help'],
    ['help', 'upgrade'],
  ])('prints scoped upgrade help for %s', async (...args) => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(args);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('Usage: ttr upgrade')
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('Upgrades the globally installed Tuturuuu CLI')
    );
  });

  it.each([
    ['tasks', '--help'],
    ['help', 'tasks'],
    ['tasks', 'help'],
  ])('prints scoped group help for %s', async (...args) => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(args);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining(
        'Usage: ttr tasks [list|search|use|get|create|update|description|delete|move|bulk]'
      )
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('Task lists are sorted by priority and due date.')
    );
  });

  it.each([
    ['finance', '--help'],
    ['help', 'finance'],
    ['finance', 'help'],
  ])('prints finance group help for %s', async (...args) => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(args);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining(
        'Usage: ttr finance <resource> [action] [id] [options]'
      )
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('Finance commands use the selected workspace')
    );
  });

  it.each([
    ['calendar', '--help'],
    ['help', 'calendar'],
    ['calendar', 'help'],
  ])('prints calendar group help for %s', async (...args) => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(args);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining(
        'Usage: ttr calendar <resource> [action] [id] [options]'
      )
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('Calendar commands use the selected workspace')
    );
  });

  it.each([
    ['box', '--help'],
    ['help', 'box'],
    ['box', 'help'],
    ['devbox', '--help'],
    ['help', 'devbox'],
    ['devbox', 'help'],
  ])('prints devbox group help for %s', async (...args) => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(args);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('Usage: ttr box')
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('clone, install, start Supabase')
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('repair an existing runner service')
    );
    expect(write).toHaveBeenCalledWith(expect.stringContaining('--dir <path>'));
  });

  it.each([
    ['finance', 'transactions', '--help'],
    ['help', 'finance', 'transactions'],
    ['finance', 'help', 'transactions'],
  ])('prints finance resource help for %s', async (...args) => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(args);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining(
        'Usage: ttr finance transactions [list|get|create|update|delete|export|stats|category-breakdown|spending-trends] [id]'
      )
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('ttr finance transactions create')
    );
  });

  it.each([
    ['calendar', 'events', '--help'],
    ['help', 'calendar', 'events'],
    ['calendar', 'help', 'events'],
  ])('prints calendar event help for %s', async (...args) => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(args);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining(
        'Usage: ttr calendar events [list|get|create|update|delete] [event-id]'
      )
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('--duration-minutes <n>')
    );
  });

  it.each([
    ['finance', 'transfers', '--help'],
    ['help', 'finance', 'transfers'],
    ['finance', 'help', 'transfers'],
  ])('prints finance transfer help for %s', async (...args) => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(args);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining(
        'Usage: ttr finance transfers [create|update|migrate] [options]'
      )
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('--from-transaction <id>')
    );
  });

  it.each([
    ['finance', 'tags', '--help'],
    ['help', 'finance', 'tags'],
    ['finance', 'help', 'tags'],
  ])('prints finance tag help for %s', async (...args) => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(args);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining(
        'Usage: ttr finance tags [list|get|create|update|delete] [id]'
      )
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('--color <#rrggbb>')
    );
  });

  it.each([
    ['finance', 'checkpoints', '--help'],
    ['help', 'finance', 'checkpoints'],
    ['finance', 'help', 'checkpoints'],
  ])('prints finance checkpoint help for %s', async (...args) => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(args);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining(
        'Usage: ttr finance checkpoints [list|get|create|update|delete|summary|batch] [id]'
      )
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('--balances <pairs>')
    );
  });

  it.each([
    ['tasks', 'create', '--help'],
    ['help', 'tasks', 'create'],
    ['tasks', 'help', 'create'],
  ])('prints scoped action help for %s', async (...args) => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(args);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('Usage: ttr tasks create [name] [options]')
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('ttr tasks create "Add Tuturuuu CLI"')
    );
  });

  it.each([
    ['tasks', 'description', '--help'],
    ['help', 'tasks', 'description'],
    ['tasks', 'help', 'description'],
  ])('prints scoped description help for %s', async (...args) => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(args);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining(
        'Usage: ttr tasks description [get|set|append|prepend|edit|clear] [task-id] [options]'
      )
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining(
        'ttr tasks description set VHP-12 --file notes.md'
      )
    );
  });

  it('prints tiptap help without requiring login', async () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(['tiptap', '--help']);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining(
        'Usage: ttr tiptap [parse|encode|decode|validate] [options]'
      )
    );
  });

  it('runs local tiptap parsing without reading CLI session config', async () => {
    vi.stubEnv(
      'TUTURUUU_CONFIG',
      '/tmp/tuturuuu-cli-missing-config/config.json'
    );
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli([
      'tiptap',
      'parse',
      '--text',
      'Hello **CLI**',
      '--format',
      'markdown',
      '--output',
      'text',
    ]);

    expect(write).toHaveBeenCalledWith(expect.stringContaining('Hello CLI'));
  });

  it.each([
    ['tasks', 'done', '--help'],
    ['tasks', 'complete', '--help'],
    ['help', 'tasks', 'done'],
    ['tasks', 'help', 'done'],
  ])('prints scoped done help for %s', async (...args) => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(args);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('Usage: ttr tasks done [task-id] [options]')
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('ttr tasks done <task-id>')
    );
  });

  it.each([
    ['tasks', 'close', '--help'],
    ['tasks', 'closed', '--help'],
    ['help', 'tasks', 'close'],
    ['tasks', 'help', 'close'],
  ])('prints scoped close help for %s', async (...args) => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await runCli(args);

    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('Usage: ttr tasks close [task-id] [options]')
    );
    expect(write).toHaveBeenCalledWith(
      expect.stringContaining('ttr tasks close <task-id>')
    );
  });

  it('adds completed_at when marking a task completed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T17:59:08.000Z'));

    expect(
      getTaskUpdatePayload({
        'json-payload': JSON.stringify({ completed: true }),
      })
    ).toEqual({
      completed: true,
      completed_at: '2026-05-02T17:59:08.000Z',
    });
  });

  it('keeps explicit done destinations when marking a task completed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T17:59:08.000Z'));

    expect(
      getTaskUpdatePayload({
        'json-payload': JSON.stringify({ completed: true }),
        list: 'done-list-1',
      })
    ).toEqual({
      completed: true,
      completed_at: '2026-05-02T17:59:08.000Z',
      list_id: 'done-list-1',
    });
  });

  it('does not override explicit completion timestamps', () => {
    expect(
      getTaskUpdatePayload({
        'json-payload': JSON.stringify({
          completed: true,
          completed_at: '2026-05-01T00:00:00.000Z',
        }),
      })
    ).toEqual({
      completed: true,
      completed_at: '2026-05-01T00:00:00.000Z',
    });
  });

  it('builds quick done payloads with an optional done list', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T17:59:08.000Z'));

    expect(getTaskDonePayload({}, 'done-list-1')).toEqual({
      completed: true,
      completed_at: '2026-05-02T17:59:08.000Z',
      list_id: 'done-list-1',
    });
  });

  it('builds quick close payloads with an optional closed list', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-02T17:59:08.000Z'));

    expect(getTaskClosePayload({}, 'closed-list-1')).toEqual({
      closed_at: '2026-05-02T17:59:08.000Z',
      completed: false,
      completed_at: null,
      list_id: 'closed-list-1',
    });
  });

  it('creates task descriptions from CLI flags', async () => {
    const taskId = '11111111-1111-4111-8111-111111111111';
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentListId: 'list-1',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        task: { id: taskId, name: 'Task with description' },
      })
    );
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCli([
      'tasks',
      'create',
      'Task with description',
      '--description',
      'Acceptance criteria',
      '--json',
      '--no-update-check',
    ]);

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tuturuuu.com/api/v1/workspaces/ws-1/tasks',
      expect.objectContaining({ method: 'POST' })
    );
    expect(JSON.parse(body.description).content[0].content[0].text).toBe(
      'Acceptance criteria'
    );
    expect(Array.isArray(body.description_yjs_state)).toBe(true);
  });

  it('updates task descriptions through the dedicated description route', async () => {
    const taskId = '11111111-1111-4111-8111-111111111111';
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        description: null,
        description_yjs_state: null,
      })
    );
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCli([
      'tasks',
      'update',
      taskId,
      '--description',
      'Surgical edit',
      '--json',
      '--no-update-check',
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://tuturuuu.com/api/v1/workspaces/ws-1/tasks/${taskId}/description`,
      expect.objectContaining({ method: 'PATCH' })
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(JSON.parse(body.description).content[0].content[0].text).toBe(
      'Surgical edit'
    );
  });

  it('sets task descriptions through the task description command', async () => {
    const taskId = '11111111-1111-4111-8111-111111111111';
    await writeTestConfig({
      baseUrl: 'https://tuturuuu.com',
      currentWorkspaceId: 'ws-1',
      session: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      },
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        description: null,
        description_yjs_state: null,
      })
    );
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runCli([
      'tasks',
      'description',
      'set',
      taskId,
      '--text',
      'Updated from description command',
      '--json',
      '--no-update-check',
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://tuturuuu.com/api/v1/workspaces/ws-1/tasks/${taskId}/description`,
      expect.objectContaining({ method: 'PATCH' })
    );
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string);
    expect(JSON.parse(body.description).content[0].content[0].text).toBe(
      'Updated from description command'
    );
  });

  it('includes assigned external workspace tasks for the personal task list', async () => {
    const tasksList = vi
      .fn()
      .mockResolvedValueOnce({
        tasks: [
          {
            id: 'personal-task',
            name: 'Personal task',
            priority: 'normal',
            task_lists: { status: 'active' },
          },
        ],
      })
      .mockResolvedValueOnce({
        tasks: [
          {
            board_name: 'Engineering',
            id: 'external-task',
            name: 'Assigned external task',
            priority: 'normal',
            task_lists: { status: 'active' },
          },
        ],
      });
    const client = {
      tasks: {
        list: tasksList,
      },
      workspaces: {
        list: vi.fn().mockResolvedValue([
          {
            id: 'personal-ws',
            name: 'Personal',
            personal: true,
          },
          {
            id: 'team-ws',
            name: 'Tuturuuu',
            personal: false,
          },
        ]),
      },
    };

    const { response } = await listTasksForCli(
      client as any,
      {
        baseUrl: 'https://tuturuuu.com',
        currentWorkspaceId: 'personal-ws',
        session: {
          accessToken: 'token',
          refreshToken: 'refresh',
        },
      },
      'personal-ws',
      {}
    );

    expect(tasksList).toHaveBeenNthCalledWith(
      1,
      'personal-ws',
      expect.objectContaining({
        completed: 'exclude',
        closed: 'exclude',
        externalIncludeDocuments: false,
        externalIncludeDoneClosed: false,
        forTimeTracking: true,
        includeArchivedBoards: false,
        includeCount: true,
        limit: 50,
        listStatuses: ['not_started', 'active'],
        offset: 0,
      })
    );
    expect(tasksList).toHaveBeenNthCalledWith(
      2,
      'team-ws',
      expect.objectContaining({
        assignedToMe: true,
        completed: 'exclude',
        closed: 'exclude',
        externalIncludeDocuments: false,
        externalIncludeDoneClosed: false,
        forTimeTracking: true,
        includeArchivedBoards: false,
        includeCount: true,
        limit: 50,
        listStatuses: ['not_started', 'active'],
        offset: 0,
      })
    );
    expect(response.tasks).toEqual([
      expect.objectContaining({
        id: 'personal-task',
        workspace_name: 'Personal',
      }),
      expect.objectContaining({
        id: 'external-task',
        source_workspace_name: 'Tuturuuu',
        workspace_name: 'Tuturuuu',
      }),
    ]);
    expect(response.pagination).toEqual(
      expect.objectContaining({
        page: 1,
        pageCount: 1,
        pageSize: 50,
        total: 2,
      })
    );
  });

  it('defaults bare task lists to the personal workspace even when another workspace is selected', async () => {
    const tasksList = vi
      .fn()
      .mockResolvedValueOnce({
        count: 1,
        tasks: [
          {
            id: 'personal-task',
            name: 'Personal task',
            priority: 'normal',
            task_lists: { status: 'active' },
          },
        ],
      })
      .mockResolvedValueOnce({
        count: 1,
        tasks: [
          {
            board_name: 'Engineering',
            id: 'assigned-task',
            name: 'Assigned task',
            priority: 'normal',
            task_lists: { status: 'active' },
          },
        ],
      });
    const client = {
      tasks: {
        list: tasksList,
      },
      workspaces: {
        list: vi.fn().mockResolvedValue([
          {
            id: 'team-ws',
            name: 'Tuturuuu',
            personal: false,
          },
          {
            id: 'personal-ws',
            name: 'Personal',
            personal: true,
          },
        ]),
      },
    };

    const { response, workspaceName } = await listTasksForCli(
      client as any,
      {
        baseUrl: 'https://tuturuuu.com',
        currentWorkspaceId: 'team-ws',
        session: {
          accessToken: 'token',
          refreshToken: 'refresh',
        },
      },
      'team-ws',
      {}
    );

    expect(tasksList).toHaveBeenNthCalledWith(
      1,
      'personal-ws',
      expect.objectContaining({
        listStatuses: ['not_started', 'active'],
      })
    );
    expect(tasksList).toHaveBeenNthCalledWith(
      2,
      'team-ws',
      expect.objectContaining({
        assignedToMe: true,
      })
    );
    expect(workspaceName).toBe('Personal');
    expect(response.tasks.map((task) => task.id)).toEqual([
      'personal-task',
      'assigned-task',
    ]);
  });

  it('filters document review done and closed list tasks from default output', async () => {
    const tasksList = vi
      .fn()
      .mockResolvedValueOnce({
        tasks: [
          {
            id: 'active-task',
            name: 'Active task',
            task_lists: { status: 'active' },
          },
          {
            id: 'review-task',
            name: 'Review task',
            task_lists: { status: 'review' },
          },
          {
            id: 'document-task',
            name: 'Document task',
            task_lists: { status: 'documents' },
          },
          {
            id: 'done-task',
            name: 'Done task',
            task_lists: { status: 'done' },
          },
          {
            id: 'closed-task',
            name: 'Closed task',
            task_lists: { status: 'closed' },
          },
        ],
      })
      .mockResolvedValueOnce({ tasks: [] });
    const client = {
      tasks: {
        list: tasksList,
      },
      workspaces: {
        list: vi.fn().mockResolvedValue([
          {
            id: 'personal-ws',
            name: 'Personal',
            personal: true,
          },
          {
            id: 'team-ws',
            name: 'Tuturuuu',
            personal: false,
          },
        ]),
      },
    };

    const { response } = await listTasksForCli(
      client as any,
      {
        baseUrl: 'https://tuturuuu.com',
        currentWorkspaceId: 'personal-ws',
        session: {
          accessToken: 'token',
          refreshToken: 'refresh',
        },
      },
      'personal-ws',
      {}
    );

    expect(tasksList).toHaveBeenNthCalledWith(
      1,
      'personal-ws',
      expect.objectContaining({
        listStatuses: ['not_started', 'active'],
      })
    );
    expect(response.tasks.map((task) => task.id)).toEqual(['active-task']);
    expect(response.pagination).toEqual(
      expect.objectContaining({
        page: 1,
        pageCount: 1,
        total: 1,
      })
    );
  });

  it('includes review list tasks when requested', async () => {
    const tasksList = vi.fn().mockResolvedValueOnce({
      tasks: [
        {
          id: 'active-task',
          name: 'Active task',
          task_lists: { status: 'active' },
        },
        {
          id: 'review-task',
          name: 'Review task',
          task_lists: { status: 'review' },
        },
      ],
    });
    const client = {
      tasks: {
        list: tasksList,
      },
      workspaces: {
        list: vi.fn().mockResolvedValue([
          {
            id: 'team-ws',
            name: 'Tuturuuu',
            personal: false,
          },
        ]),
      },
    };

    const { response } = await listTasksForCli(
      client as any,
      {
        baseUrl: 'https://tuturuuu.com',
        currentWorkspaceId: 'team-ws',
        session: {
          accessToken: 'token',
          refreshToken: 'refresh',
        },
      },
      'team-ws',
      { 'include-review': true }
    );

    expect(tasksList).toHaveBeenCalledWith(
      'team-ws',
      expect.objectContaining({
        forTimeTracking: false,
        listStatuses: ['not_started', 'active', 'review'],
        limit: 50,
        offset: 0,
      })
    );
    expect(response.tasks.map((task) => task.id)).toEqual([
      'active-task',
      'review-task',
    ]);
  });

  it('includes archived board tasks when requested', async () => {
    const tasksList = vi.fn().mockResolvedValueOnce({
      tasks: [
        {
          id: 'archived-board-task',
          name: 'Archived board task',
          task_lists: { status: 'active' },
        },
      ],
    });
    const client = {
      tasks: {
        list: tasksList,
      },
      workspaces: {
        list: vi.fn().mockResolvedValue([
          {
            id: 'team-ws',
            name: 'Tuturuuu',
            personal: false,
          },
        ]),
      },
    };

    const { response } = await listTasksForCli(
      client as any,
      {
        baseUrl: 'https://tuturuuu.com',
        currentWorkspaceId: 'team-ws',
        session: {
          accessToken: 'token',
          refreshToken: 'refresh',
        },
      },
      'team-ws',
      { 'include-archived': true }
    );

    expect(tasksList).toHaveBeenCalledWith(
      'team-ws',
      expect.objectContaining({
        includeArchivedBoards: true,
      })
    );
    expect(response.tasks.map((task) => task.id)).toEqual([
      'archived-board-task',
    ]);
  });

  it('paginates the combined personal and assigned external task output', async () => {
    const tasksList = vi
      .fn()
      .mockResolvedValueOnce({
        tasks: [
          {
            id: 'personal-critical',
            name: 'Personal critical',
            priority: 'critical',
            task_lists: { status: 'active' },
          },
          {
            id: 'personal-low',
            name: 'Personal low',
            priority: 'low',
            task_lists: { status: 'active' },
          },
        ],
      })
      .mockResolvedValueOnce({
        tasks: [
          {
            id: 'external-high',
            name: 'External high',
            priority: 'high',
            task_lists: { status: 'active' },
          },
          {
            id: 'external-normal',
            name: 'External normal',
            priority: 'normal',
            task_lists: { status: 'active' },
          },
        ],
      });
    const client = {
      tasks: {
        list: tasksList,
      },
      workspaces: {
        list: vi.fn().mockResolvedValue([
          {
            id: 'personal-ws',
            name: 'Personal',
            personal: true,
          },
          {
            id: 'team-ws',
            name: 'Tuturuuu',
            personal: false,
          },
        ]),
      },
    };

    const { response } = await listTasksForCli(
      client as any,
      {
        baseUrl: 'https://tuturuuu.com',
        currentWorkspaceId: 'personal-ws',
        session: {
          accessToken: 'token',
          refreshToken: 'refresh',
        },
      },
      'personal-ws',
      { page: '2', 'page-size': '2' }
    );

    expect(tasksList).toHaveBeenNthCalledWith(
      1,
      'personal-ws',
      expect.objectContaining({
        includeCount: true,
        limit: 4,
        offset: 0,
      })
    );
    expect(tasksList).toHaveBeenNthCalledWith(
      2,
      'team-ws',
      expect.objectContaining({
        assignedToMe: true,
        includeCount: true,
        limit: 4,
        offset: 0,
      })
    );
    expect(response.tasks.map((task) => task.id)).toEqual([
      'external-normal',
      'personal-low',
    ]);
    expect(response.pagination).toEqual({
      hasNextPage: false,
      hasPreviousPage: true,
      offset: 2,
      page: 2,
      pageCount: 2,
      pageSize: 2,
      total: 4,
    });
  });
});
