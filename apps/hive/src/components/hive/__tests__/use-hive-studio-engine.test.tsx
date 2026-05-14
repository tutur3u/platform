import { render, screen, waitFor } from '@testing-library/react';
import type { HiveServersResponse } from '@tuturuuu/internal-api/hive';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HiveSnapshotResponse } from '@/engine/types';
import { createDefaultWorld } from '@/engine/world';
import { useHiveStudioEngine } from '../use-hive-studio-engine';

const server = {
  createdAt: '2026-05-14T00:00:00.000Z',
  description: null,
  enabled: true,
  id: '8f7fa5cf-8bb1-446a-9c51-f4222f452f4d',
  maxPlayers: 8,
  name: 'Research Garden',
  settings: {},
  slug: 'research-garden',
};

let serversData: HiveServersResponse;
let snapshotData: HiveSnapshotResponse | null;

vi.mock('@/hooks/use-hive-data', () => ({
  useHiveMutations: () => ({
    createNpc: { isPending: false, mutate: vi.fn() },
    createServer: { isPending: false, mutate: vi.fn() },
    createWorldEvent: { isPending: false, mutate: vi.fn() },
    deleteNpc: { isPending: false, mutate: vi.fn() },
    deleteServer: { isPending: false, mutate: vi.fn() },
    runNpc: { isPending: false, mutate: vi.fn() },
    runSimulationTick: { isPending: false, mutate: vi.fn() },
    updateNpc: { isPending: false, mutate: vi.fn() },
    updateServer: { isPending: false, mutate: vi.fn() },
    updateServerSettings: { isPending: false, mutate: vi.fn() },
  }),
  useHiveRealtimeToken: () => ({ data: null }),
  useHiveServers: () => ({ data: serversData }),
  useHiveSnapshot: () => ({
    data: snapshotData,
    refetch: vi.fn(),
  }),
}));

vi.mock('../use-hive-realtime-session', () => ({
  createHiveAwareness: vi.fn(() => ({
    color: '#22c55e',
    displayName: 'Test user',
    lastSeenAt: '2026-05-14T00:00:00.000Z',
    role: 'member',
    userId: 'user-1',
  })),
  useHiveRealtimeSession: () => ({
    realtimeClientRef: { current: null },
    sendCursorPosition: vi.fn(),
  }),
}));

function Harness() {
  const engine = useHiveStudioEngine({
    currentUser: { displayName: 'Test user', id: 'user-1' },
    initialServers: serversData,
    realtimeUrl: 'ws://localhost:8787',
  });

  return (
    <output data-testid="engine-state">
      {engine.serverId ?? 'none'}:{engine.world.blocks.length}:
      {engine.npcs.length}:{engine.revision}
    </output>
  );
}

describe('useHiveStudioEngine', () => {
  beforeEach(() => {
    installLocalStorageMock();
    window.localStorage.clear();
    serversData = { isAdmin: true, servers: [server] };
    snapshotData = {
      events: [],
      npcs: [],
      revision: 7,
      server,
      world: createDefaultWorld(),
    };
  });

  it('clears stale world state when the selected server no longer exists', async () => {
    const { rerender } = render(<Harness />);

    await waitFor(() =>
      expect(screen.getByTestId('engine-state').textContent).toBe(
        `${server.id}:100:0:7`
      )
    );

    serversData = { isAdmin: true, servers: [] };
    rerender(<Harness />);

    await waitFor(() =>
      expect(screen.getByTestId('engine-state').textContent).toBe('none:0:0:0')
    );
  });

  it('updates NPC snapshot data without replaying equal-revision world snapshots', async () => {
    const { rerender } = render(<Harness />);

    await waitFor(() =>
      expect(screen.getByTestId('engine-state').textContent).toBe(
        `${server.id}:100:0:7`
      )
    );

    snapshotData = {
      ...snapshotData!,
      npcs: [
        {
          backstory: '',
          backstoryEnabled: true,
          customPromptEnabled: false,
          id: 'npc-1',
          memoryEnabled: true,
          model: 'gemini-2.5-flash-lite',
          name: 'Researcher',
          position: { x: 0, y: 1, z: 0 },
          role: 'resident',
          serverId: server.id,
          settings: {},
          systemPrompt: '',
        },
      ],
      world: {
        blocks: [],
        objects: [],
      },
    };
    rerender(<Harness />);

    await waitFor(() =>
      expect(screen.getByTestId('engine-state').textContent).toBe(
        `${server.id}:100:1:7`
      )
    );
  });
});

function installLocalStorageMock() {
  const store = new Map<string, string>();

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
  });
}
