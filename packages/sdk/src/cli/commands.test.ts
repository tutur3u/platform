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
        'Usage: ttr tasks [list|use|get|create|update|delete|move|bulk]'
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
