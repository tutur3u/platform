import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  workspace: vi.fn(),
  dataset: vi.fn(),
  unauthorized: vi.fn(() => {
    throw new Error('401');
  }),
  notFound: vi.fn(() => {
    throw new Error('404');
  }),
}));
vi.mock('./access', () => ({
  resolveDatasetWorkspaceAccess: mocks.workspace,
  resolveDatasetAccess: mocks.dataset,
}));
vi.mock('next/navigation', () => ({
  unauthorized: mocks.unauthorized,
  notFound: mocks.notFound,
}));

import {
  requireDatasetAccess,
  requireDatasetWorkspaceAccess,
} from './page-access';

describe('dataset page access interrupts', () => {
  beforeEach(() => vi.clearAllMocks());
  it('renders a 401 interrupt for anonymous workspace pages', async () => {
    mocks.workspace.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 401 }),
    });
    await expect(requireDatasetWorkspaceAccess('ws-a')).rejects.toThrow('401');
    expect(mocks.unauthorized).toHaveBeenCalledOnce();
  });
  it.each([403, 404])(
    'hides unauthorized dataset pages for status %s',
    async (status) => {
      mocks.dataset.mockResolvedValue({
        ok: false,
        response: new Response(null, { status }),
      });
      await expect(requireDatasetAccess('ws-a', 'ds-b')).rejects.toThrow('404');
      expect(mocks.notFound).toHaveBeenCalledOnce();
    }
  );
  it('retains unavailable errors rather than turning them into missing resources', async () => {
    mocks.dataset.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 500 }),
    });
    await expect(requireDatasetAccess('ws-a', 'ds-a')).rejects.toThrow(
      'Dataset access could not be verified'
    );
  });
});
