import type { SupabaseClient } from '@tuturuuu/supabase';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMiraContext } from './context-builder';

const memories = vi.hoisted(() => vi.fn().mockResolvedValue(''));
vi.mock('../memory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../memory')>()),
  buildAiMemoryContext: memories,
}));

class ContextBuilderSupabaseMock {
  public gate: Promise<void> | null = null;
  public failingTable: string | null = null;
  public readonly started: string[] = [];

  constructor(
    private readonly soul: {
      name: string;
      personality: string;
      tone: string;
      chat_tone: string;
    } | null = null
  ) {}
  public readonly queriedTables: string[] = [];

  schema(_schema: string) {
    return this;
  }

  from(table: string) {
    this.queriedTables.push(table);

    const respond = async () => {
      this.started.push(table);
      await this.gate;
      if (this.failingTable === table) throw new Error(`${table} failed`);
      switch (table) {
        case 'mira_soul':
          return { data: this.soul, error: null };
        case 'workspace_calendar_events':
          return {
            data: [
              {
                title: 'Planning',
                start_at: '2026-03-13T08:00:00.000Z',
                end_at: '2026-03-13T09:00:00.000Z',
                location: 'Room 1',
              },
            ],
            error: null,
          };
        case 'workspace_wallets':
          return {
            data: [{ name: 'Main', currency: 'USD', balance: 120 }],
            error: null,
          };
        case 'mira_memories':
          return { data: [], error: null };
        default:
          return { data: null, error: null };
      }
    };

    const makeBuilder = () =>
      Object.assign(
        Promise.resolve().then(() => respond()),
        {
          select: () => makeBuilder(),
          eq: () => makeBuilder(),
          gte: () => makeBuilder(),
          lte: () => makeBuilder(),
          order: () => makeBuilder(),
          limit: () => makeBuilder(),
          maybeSingle: async () => {
            const result = await respond();
            return {
              data: !Array.isArray(result.data) ? result.data : null,
              error: result.error,
            };
          },
        }
      );

    return makeBuilder();
  }

  public readonly rpcCalls: string[] = [];

  async rpc(name: string) {
    this.rpcCalls.push(name);
    this.started.push(name);
    await this.gate;
    if (this.failingTable === name) throw new Error(`${name} failed`);
    if (name !== 'get_user_accessible_tasks') {
      return { data: null, error: null };
    }

    return {
      data: [
        {
          task_id: 'task-1',
          task_name: 'Finish docs',
          task_priority: 'high',
          task_end_date: '2026-03-13T12:00:00.000Z',
          task_completed_at: null,
          task_closed_at: null,
        },
      ],
      error: null,
    };
  }
}

const allowAll = () => false;

function buildFor(
  latestUserMessage: string | null | undefined,
  supabase = new ContextBuilderSupabaseMock()
) {
  return {
    supabase,
    result: buildMiraContext({
      latestUserMessage,
      supabase: supabase as unknown as SupabaseClient,
      timezone: 'UTC',
      userId: 'user-1',
      withoutPermission: allowAll,
      wsId: 'workspace-1',
    }),
  };
}

describe('buildMiraContext', () => {
  beforeEach(() => {
    memories.mockReset();
    memories.mockResolvedValue('');
  });

  it('loads speaking preferences from persisted personality and scoped memories', async () => {
    memories.mockResolvedValueOnce(
      '## User Memories\n- Speak slowly with a Southern Vietnamese accent.'
    );
    const result = await buildMiraContext({
      supabase: new ContextBuilderSupabaseMock({
        name: 'Chachipiki',
        personality: 'Speak Vietnamese with a warm voice.',
        tone: 'warm',
        chat_tone: 'detailed',
      }) as unknown as SupabaseClient,
      userId: 'user-1',
      wsId: 'workspace-1',
      withoutPermission: () => true,
    });
    expect(result.contextString).toContain('Your name is Chachipiki.');
    expect(result.contextString).toContain(
      'Speak Vietnamese with a warm voice.'
    );
    expect(result.contextString).toContain(
      'Speak slowly with a Southern Vietnamese accent.'
    );
    expect(result.soul).toMatchObject({
      name: 'Chachipiki',
      tone: 'warm',
      chat_tone: 'detailed',
    });
    expect(memories).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: expect.objectContaining({
          userId: 'user-1',
          wsId: 'workspace-1',
        }),
      })
    );
  });

  it('omits calendar and finance context when the user lacks those permissions', async () => {
    const supabase =
      new ContextBuilderSupabaseMock() as unknown as SupabaseClient;

    const result = await buildMiraContext({
      userId: 'user-1',
      wsId: 'workspace-1',
      supabase,
      timezone: 'UTC',
      withoutPermission: (permission) =>
        permission === 'manage_calendar' || permission === 'manage_finance',
    });

    expect(result.contextString).toContain('## Tasks');
    expect(result.contextString).not.toContain('## Calendar');
    expect(result.contextString).not.toContain('## Wallets');
    expect(
      (supabase as unknown as ContextBuilderSupabaseMock).queriedTables
    ).not.toContain('workspace_calendar_events');
    expect(
      (supabase as unknown as ContextBuilderSupabaseMock).queriedTables
    ).not.toContain('workspace_wallets');
  });

  it('keeps identity but skips memory and domain queries for a greeting', async () => {
    const { result, supabase } = buildFor(
      'hi Mira!',
      new ContextBuilderSupabaseMock({
        name: 'Chachipiki',
        personality: 'Patient tutor',
        tone: 'warm',
        chat_tone: 'brief',
      })
    );
    const context = await result;

    expect(memories).not.toHaveBeenCalled();
    expect(supabase.rpcCalls).toEqual([]);
    expect(supabase.queriedTables).toEqual(['mira_soul']);
    expect(context.contextString).toContain('Your name is Chachipiki.');
    expect(context.contextString).toContain('Current time:');
    expect(context.contextString).toContain(
      '## Not Preloaded\ntasks, calendar events, wallets, saved memories (use recall).'
    );
    expect(context.timings.map((timing) => timing.name)).toEqual([
      'soul',
      'total',
    ]);
  });

  it('never advertises deferred sections the user cannot read', async () => {
    const supabase = new ContextBuilderSupabaseMock();
    const context = await buildMiraContext({
      latestUserMessage: 'thanks',
      supabase: supabase as unknown as SupabaseClient,
      userId: 'user-1',
      withoutPermission: (permission) =>
        permission === 'manage_calendar' || permission === 'manage_finance',
      wsId: 'workspace-1',
    });
    expect(context.contextString).toContain(
      '## Not Preloaded\ntasks, saved memories (use recall).'
    );
  });

  it.each([
    ['my tasks', ['## Tasks'], ['## Calendar', '## Wallets']],
    [
      "what's on my calendar tomorrow?",
      ['## Tasks', '## Calendar'],
      ['## Wallets'],
    ],
    ['what is my wallet balance', ['## Wallets'], ['## Tasks', '## Calendar']],
    [
      'switch to the Marketing workspace',
      ['## Tasks', '## Calendar', '## Wallets'],
      ['## Not Preloaded'],
    ],
  ])(
    'loads the blocks the turn %j needs and keeps memories',
    async (message, present, absent) => {
      const { result } = buildFor(message);
      const context = await result;
      for (const heading of present) {
        expect(context.contextString).toContain(heading);
      }
      for (const heading of absent) {
        expect(context.contextString).not.toContain(heading);
      }
      expect(memories).toHaveBeenCalledTimes(1);
    }
  );

  it('loads every section when no turn text is supplied', async () => {
    const { result, supabase } = buildFor(undefined);
    const context = await result;
    expect(context.contextString).toContain('## Tasks');
    expect(context.contextString).toContain('## Calendar');
    expect(context.contextString).toContain('## Wallets');
    expect(context.contextString).not.toContain('## Not Preloaded');
    expect(memories).toHaveBeenCalledTimes(1);
    expect(supabase.rpcCalls).toEqual(['get_user_accessible_tasks']);
    expect(context.timings.map((timing) => timing.name).sort()).toEqual([
      'calendar',
      'finance',
      'memories',
      'soul',
      'tasks',
      'total',
    ]);
    for (const timing of context.timings) {
      expect(Object.keys(timing).sort()).toEqual(['ms', 'name']);
      expect(timing.ms).toBeGreaterThanOrEqual(0);
    }
  });

  it('starts every needed source before any of them settles', async () => {
    const supabase = new ContextBuilderSupabaseMock();
    let release!: () => void;
    supabase.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    memories.mockImplementation(async () => {
      supabase.started.push('memories');
      await supabase.gate;
      return '';
    });

    const { result } = buildFor('catch me up', supabase);
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Each chained mock builder resolves eagerly, so compare distinct sources.
    expect([...new Set(supabase.started)].sort()).toEqual([
      'get_user_accessible_tasks',
      'memories',
      'mira_soul',
      'workspace_calendar_events',
      'workspace_wallets',
    ]);

    release();
    await expect(result).resolves.toMatchObject({ isFirstInteraction: true });
  });

  it('fails closed when the memory branch rejects', async () => {
    memories.mockRejectedValueOnce(new Error('memory settings unavailable'));
    const { result } = buildFor('what do you remember about me?');
    await expect(result).rejects.toThrow('memory settings unavailable');
  });

  it('fails closed when a needed domain query rejects', async () => {
    const supabase = new ContextBuilderSupabaseMock();
    supabase.failingTable = 'get_user_accessible_tasks';
    const { result } = buildFor('my tasks', supabase);
    await expect(result).rejects.toThrow('get_user_accessible_tasks failed');
  });

  it('does not touch a failing source the turn does not need', async () => {
    const supabase = new ContextBuilderSupabaseMock();
    supabase.failingTable = 'workspace_wallets';
    memories.mockRejectedValueOnce(new Error('unused'));
    const { result } = buildFor('hello', supabase);
    await expect(result).resolves.toMatchObject({ isFirstInteraction: true });
    memories.mockReset();
  });
});
