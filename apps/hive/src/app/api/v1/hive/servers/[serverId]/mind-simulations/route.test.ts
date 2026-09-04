import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildPlan: vi.fn(),
  getSnapshot: vi.fn(),
  materialize: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  requireAdmin: vi.fn(),
  verifyMembership: vi.fn(),
}));

vi.mock('@tuturuuu/mind-core', () => ({
  getMindBoardGraphSnapshot: mocks.getSnapshot,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: vi.fn(async () => ({ name: 'supabase' })),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
  verifyWorkspaceMembershipType: mocks.verifyMembership,
}));
vi.mock('@/lib/hive/mind-simulation-blueprint', () => ({
  buildHiveMindSimulationPlan: mocks.buildPlan,
}));
vi.mock('@/lib/hive/mind-simulation-materializer', () => ({
  HiveMindMaterializationValidationError: class extends Error {},
  materializeHiveMindSimulation: mocks.materialize,
}));
vi.mock('../../../_shared', () => ({
  mapHiveNpc: (npc: unknown) => npc,
  requireHiveAdmin: mocks.requireAdmin,
  withHiveRoute: async (
    _request: Request,
    _route: string,
    handler: () => Promise<Response>
  ) => handler(),
}));

import { HiveMindMaterializationValidationError } from '@/lib/hive/mind-simulation-materializer';
import { POST } from './route';

const SERVER_ID = '00000000-0000-4000-8000-000000001101';
const BOARD_ID = '00000000-0000-4000-8000-000000001102';
const WS_ID = '00000000-0000-4000-8000-000000001103';
const snapshot = {
  board: { id: BOARD_ID, title: 'Atomic board' },
  edges: [{ id: 'edge-1' }],
  nodes: [{ id: 'node-1' }, { id: 'node-2' }],
};
const plan = {
  agents: [{ sourceNodeId: 'node-1' }, { sourceNodeId: 'node-2' }],
  pairs: [{ sourceNodeId: 'node-1', targetNodeId: 'node-2' }],
};

function request(body: unknown) {
  return new Request('https://hive.test/mind-simulations', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
}

function params() {
  return { params: Promise.resolve({ serverId: SERVER_ID }) };
}

describe('POST Mind simulation materialization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      access: { user: { id: 'user-1' } },
      ok: true,
    });
    mocks.normalizeWorkspaceId.mockResolvedValue(WS_ID);
    mocks.verifyMembership.mockResolvedValue({ ok: true });
    mocks.getSnapshot.mockResolvedValue(snapshot);
    mocks.buildPlan.mockReturnValue(plan);
    mocks.materialize.mockResolvedValue({
      agents: [{ npcId: 'npc-1' }, { npcId: 'npc-2' }],
      npcRows: [{ id: 'npc-1' }, { id: 'npc-2' }],
      pairs: [{ sourceNpcId: 'npc-1', targetNpcId: 'npc-2' }],
      workflow: { id: 'workflow-1' },
    });
  });

  it('returns the existing success contract only after materialization commits', async () => {
    const response = await POST(
      request({ boardId: BOARD_ID, workspaceId: WS_ID }) as never,
      params()
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      mindBoard: {
        edgeCount: 1,
        id: BOARD_ID,
        nodeCount: 2,
        title: 'Atomic board',
      },
      npcs: [{ id: 'npc-1' }, { id: 'npc-2' }],
      summary: { agents: 2, pairs: 1 },
      workflow: { id: 'workflow-1' },
    });
    expect(mocks.materialize).toHaveBeenCalledOnce();
  });

  it('rejects an undersized board plan before materialization', async () => {
    mocks.buildPlan.mockReturnValue({
      agents: [{ sourceNodeId: 'node-1' }],
      pairs: [],
    });

    const response = await POST(
      request({ boardId: BOARD_ID, workspaceId: WS_ID }) as never,
      params()
    );

    expect(response.status).toBe(400);
    expect(mocks.materialize).not.toHaveBeenCalled();
  });

  it('preserves deterministic 400 workflow validation errors', async () => {
    mocks.materialize.mockRejectedValue(
      new HiveMindMaterializationValidationError('Invalid workflow')
    );

    const response = await POST(
      request({ boardId: BOARD_ID, workspaceId: WS_ID }) as never,
      params()
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid workflow' });
  });

  it.each([
    ['second NPC bundle', 'npc insert fault'],
    ['workflow insert', 'workflow insert fault'],
  ])('sanitizes %s persistence failures', async (_label, message) => {
    mocks.materialize.mockRejectedValue(new Error(message));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await POST(
      request({ boardId: BOARD_ID, workspaceId: WS_ID }) as never,
      params()
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Failed to create Hive simulation from Mind board',
    });
    expect(consoleSpy).toHaveBeenCalledOnce();
  });
});
