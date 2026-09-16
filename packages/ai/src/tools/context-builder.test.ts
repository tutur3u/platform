import type { SupabaseClient } from '@tuturuuu/supabase';
import { describe, expect, it, vi } from 'vitest';
import { buildMiraContext } from './context-builder';

const memories = vi.hoisted(() => vi.fn().mockResolvedValue(''));
vi.mock('../memory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../memory')>()),
  buildAiMemoryContext: memories,
}));

class ContextBuilderSupabaseMock {
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

  rpc(name: string) {
    if (name !== 'get_user_accessible_tasks') {
      return Promise.resolve({ data: null, error: null });
    }

    return Promise.resolve({
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
    });
  }
}

describe('buildMiraContext', () => {
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
});
