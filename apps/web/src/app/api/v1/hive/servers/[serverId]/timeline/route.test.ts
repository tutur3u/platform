import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  getHiveSnapshot: vi.fn(),
  listHiveNpcRuns: vi.fn(),
}));

vi.mock('@/lib/hive/hive-db', () => ({
  getHiveSnapshot: (...args: unknown[]) => mocks.getHiveSnapshot(...args),
}));

vi.mock('@/lib/hive/npcs', () => ({
  listHiveNpcRuns: (...args: unknown[]) => mocks.listHiveNpcRuns(...args),
}));

vi.mock('../../../_shared', () => ({
  mapHiveEvent: (row: {
    actor_user_id: string | null;
    created_at: string;
    event_type: string;
    id: string;
    payload: Record<string, unknown>;
    revision: number;
  }) => ({
    actorUserId: row.actor_user_id,
    createdAt: row.created_at,
    eventType: row.event_type,
    id: row.id,
    payload: row.payload,
    revision: row.revision,
  }),
  mapHiveNpcRun: (row: {
    actor_user_id: string | null;
    autonomous: boolean;
    credit_source: 'personal' | 'workspace' | null;
    credit_ws_id: string | null;
    credits_deducted: number;
    created_at: string;
    error: string | null;
    id: string;
    input_context: Record<string, unknown>;
    input_tokens: number;
    interaction_id: string | null;
    llm_cost: number;
    llm_model: string | null;
    llm_provider: string | null;
    npc_id: string;
    output_decision: Record<string, unknown>;
    output_tokens: number;
    prompt_mode: string;
    reasoning_tokens: number;
    status: 'completed' | 'failed' | 'running' | 'skipped';
    target_npc_id: string | null;
    trigger: 'manual' | 'simulation';
  }) => ({
    actorUserId: row.actor_user_id,
    autonomous: row.autonomous,
    creditSource: row.credit_source,
    creditWsId: row.credit_ws_id,
    creditsDeducted: row.credits_deducted,
    createdAt: row.created_at,
    error: row.error,
    id: row.id,
    inputContext: row.input_context,
    inputTokens: row.input_tokens,
    interactionId: row.interaction_id,
    llmCost: row.llm_cost,
    llmModel: row.llm_model,
    llmProvider: row.llm_provider,
    npcId: row.npc_id,
    outputDecision: row.output_decision,
    outputTokens: row.output_tokens,
    promptMode: row.prompt_mode,
    reasoningTokens: row.reasoning_tokens,
    status: row.status,
    targetNpcId: row.target_npc_id,
    trigger: row.trigger,
  }),
  requireHiveAccess: vi.fn().mockResolvedValue({
    access: { user: { id: 'user-1' } },
    ok: true,
  }),
  withHiveRoute: (
    _request: NextRequest,
    _route: string,
    handler: () => Promise<Response>
  ) => handler(),
}));

describe('Hive timeline route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getHiveSnapshot.mockResolvedValue({
      events: [
        {
          actor_user_id: 'user-1',
          created_at: '2026-05-17T10:00:00.000Z',
          event_type: 'npc.interaction',
          id: 'event-1',
          payload: {},
          revision: 9,
        },
      ],
    });
    mocks.listHiveNpcRuns.mockResolvedValue([
      createRun({
        created_at: '2026-05-17T10:02:00.000Z',
        id: 'run-2',
        npc_id: 'npc-2',
        npc_name: 'Ada',
        output_decision: { spokenText: 'I can help.' },
        target_npc_id: 'npc-1',
        target_npc_name: 'Bee',
      }),
      createRun({
        created_at: '2026-05-17T10:01:00.000Z',
        id: 'run-1',
        npc_id: 'npc-1',
        npc_name: 'Bee',
        output_decision: { conversationSummary: 'Bee asked Ada for help.' },
        target_npc_id: 'npc-2',
        target_npc_name: 'Ada',
      }),
    ]);
  });

  it('groups NPC run turns by interaction id with aggregate cost metadata', async () => {
    const response = await GET(
      new NextRequest(
        'https://tuturuuu.com/api/v1/hive/servers/server-1/timeline'
      ),
      { params: Promise.resolve({ serverId: 'server-1' }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.items[0]).toMatchObject({
      creditsDeducted: 0.75,
      interactionId: '00000000-0000-4000-8000-000000000021',
      kind: 'interaction',
      runs: [{ id: 'run-1' }, { id: 'run-2' }],
    });
    expect(body.items[1]).toMatchObject({
      eventType: 'npc.interaction',
      kind: 'event',
    });
  });
});

function createRun(
  overrides: Partial<{
    created_at: string;
    id: string;
    npc_id: string;
    npc_name: string;
    output_decision: Record<string, unknown>;
    target_npc_id: string;
    target_npc_name: string;
  }>
) {
  return {
    actor_user_id: 'user-1',
    autonomous: false,
    credit_source: 'workspace',
    credit_ws_id: '00000000-0000-4000-8000-000000000020',
    credits_deducted: 0.375,
    created_at: overrides.created_at ?? '2026-05-17T10:01:00.000Z',
    error: null,
    id: overrides.id ?? 'run-1',
    input_context: {},
    input_tokens: 10,
    interaction_id: '00000000-0000-4000-8000-000000000021',
    llm_cost: 0.375,
    llm_model: 'google/gemini-2.5-flash-lite',
    llm_provider: 'google',
    npc_id: overrides.npc_id ?? 'npc-1',
    npc_name: overrides.npc_name ?? 'Bee',
    output_decision: overrides.output_decision ?? {},
    output_tokens: 12,
    prompt_mode: 'enhanced',
    reasoning_tokens: 0,
    status: 'completed',
    target_npc_id: overrides.target_npc_id ?? 'npc-2',
    target_npc_name: overrides.target_npc_name ?? 'Ada',
    trigger: 'manual',
  };
}
