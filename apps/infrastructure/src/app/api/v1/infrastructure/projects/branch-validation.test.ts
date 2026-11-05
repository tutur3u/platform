import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/infrastructure/projects', () => ({
  createInfrastructureProject: mocks.create,
  updateInfrastructureProject: mocks.update,
  listInfrastructureProjects: vi.fn(),
  deleteInfrastructureProject: vi.fn(),
}));
vi.mock('@/lib/infrastructure/log-drain', () => ({
  withRequestLogDrain: async (
    _options: unknown,
    handler: () => Promise<unknown>
  ) => handler(),
}));
vi.mock('../monitoring/blue-green/authorization', () => ({
  authorizeInfrastructureOperator: async () => ({ ok: true }),
  authorizeInfrastructureViewer: async () => ({ ok: true }),
}));

import { PATCH } from './[projectId]/route';
import { POST } from './route';

beforeEach(() => vi.clearAllMocks());
for (const selectedBranch of [
  '--upload-pack=evil',
  '..',
  '-main',
  ' ',
  ' main',
  'main branch',
  null,
  42,
]) {
  test(`rejects unsafe saved branch ${JSON.stringify(selectedBranch)}`, async () => {
    for (const method of ['POST', 'PATCH']) {
      const request = new Request(
        'https://example.test/api/v1/infrastructure/projects',
        {
          method,
          body: JSON.stringify({
            selectedBranch,
            repoUrl: 'https://github.com/example/repo',
          }),
        }
      );
      const response =
        method === 'POST'
          ? await POST(request)
          : await PATCH(request, {
              params: Promise.resolve({ projectId: 'project' }),
            });
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        message: 'Selected branch must be a valid branch name.',
      });
    }
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
}
test('accepts valid saved branches', async () => {
  mocks.create.mockResolvedValue({ selectedBranch: 'fix/example' });
  const response = await POST(
    new Request('https://example.test', {
      method: 'POST',
      body: JSON.stringify({
        selectedBranch: 'fix/example',
        repoUrl: 'https://github.com/example/repo',
      }),
    })
  );
  expect(response.status).toBe(200);
  expect(mocks.create).toHaveBeenCalledWith(
    expect.objectContaining({ selectedBranch: 'fix/example' })
  );
});
