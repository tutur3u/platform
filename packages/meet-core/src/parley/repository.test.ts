import { beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({ database: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./database', () => ({ parleyDatabase: f.database }));

import {
  getFacilitatorNotes,
  getPublishedScenario,
  listFacilitatedSessions,
} from './repository';

function query(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    range: vi.fn().mockResolvedValue(result),
    maybeSingle: vi.fn().mockResolvedValue(result),
    limit: vi.fn().mockResolvedValue(result),
  };
}
beforeEach(() => vi.resetAllMocks());
it('does not read notes when the viewer is not the facilitator', async () => {
  const session = query({ data: null, error: null });
  const from = vi.fn().mockReturnValue(session);
  f.database.mockResolvedValue({ schema: () => ({ from }) });
  expect(await getFacilitatorNotes('meeting', 'other-user')).toBeNull();
  expect(session.eq).toHaveBeenCalledWith('created_by', 'other-user');
  expect(from).toHaveBeenCalledTimes(1);
});
it('fails closed when session authorization is unavailable', async () => {
  const session = query({ data: null, error: { message: 'offline' } });
  f.database.mockResolvedValue({ schema: () => ({ from: () => session }) });
  await expect(getFacilitatorNotes('meeting', 'owner')).rejects.toThrow(
    'authorization unavailable'
  );
});
it('paginates owner-scoped history and strips private instructions from summaries', async () => {
  const snapshot = {
    title: 'Synthetic',
    category: 'General',
    briefing: 'Public briefing',
    instructions: 'Private fixture',
    rubric: 'Private rubric',
    roles: [],
    enabled: true,
  };
  const rows = Array.from({ length: 21 }, (_, i) => ({
    meeting_id: String(i),
    scenario_id: 'scenario',
    scenario_revision: 2,
    snapshot,
    created_at: '2026-09-25',
  }));
  const sessions = query({ data: rows, error: null });
  f.database.mockResolvedValue({ schema: () => ({ from: () => sessions }) });
  const result = await listFacilitatedSessions('owner', 2);
  expect(sessions.eq).toHaveBeenCalledWith('created_by', 'owner');
  expect(sessions.range).toHaveBeenCalledWith(40, 60);
  expect(result.hasMore).toBe(true);
  expect(result.sessions).toHaveLength(20);
  expect(JSON.stringify(result)).not.toContain('Private');
  expect(result.sessions[0]).not.toHaveProperty('snapshot');
});

it('excludes hidden role briefs from published discovery data', async () => {
  const row = {
    id: '7e21d4f3-268a-4985-a202-ed9f78b045a8',
    title: 'Synthetic',
    category: 'General',
    briefing: 'Public',
    revision: 1,
    roles: [{ name: 'Guest', controller: 'human', brief: 'Hidden fixture' }],
  };
  const scenario = query({ data: row, error: null });
  f.database.mockResolvedValue({ schema: () => ({ from: () => scenario }) });
  const result = await getPublishedScenario(row.id);
  expect(scenario.eq).toHaveBeenCalledWith('enabled', true);
  expect(result?.roles).toEqual([
    { name: 'Guest', controller: 'human', brief: '' },
  ]);
  expect(JSON.stringify(result)).not.toContain('Hidden fixture');
});
