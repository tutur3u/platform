import { describe, expect, it, vi } from 'vitest';

const call = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => ({
    validator: () => ({ handler: () => call }),
    handler: () => call,
  }),
}));
import { fetchSatelliteWorkspaces, fetchWorkspaces } from './action-ports';

describe('workspace discovery POST input', () => {
  it('sends explicit empty JSON data through both workspace action exports', async () => {
    await expect(fetchWorkspaces()).resolves.toEqual([]);
    await expect(fetchSatelliteWorkspaces()).resolves.toEqual([]);
    expect(call).toHaveBeenNthCalledWith(1, { data: {} });
    expect(call).toHaveBeenNthCalledWith(2, { data: {} });
  });
});
