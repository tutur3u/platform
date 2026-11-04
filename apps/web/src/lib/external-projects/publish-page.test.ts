import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  previous: vi.fn(),
  invalidate: vi.fn(),
  publish: vi.fn(),
  purge: vi.fn(),
  target: vi.fn(),
}));
vi.mock('./cache', () => ({
  invalidateWorkspaceExternalProjectCache: mocks.invalidate,
}));
vi.mock('./page-versions', () => ({
  getPublishedPageVersion: mocks.previous,
  publishPageVersion: mocks.publish,
}));
vi.mock('./renderer-purge', () => ({
  purgeRendererPage: mocks.purge,
  rendererPurgeTarget: mocks.target,
}));

import { publishPageAndPurge } from './publish-page';

const scope = {
  actorId: 'publisher',
  entryId: 'entry',
  versionId: 'new-version',
  workspaceId: 'workspace',
  siteId: 'first-site',
};
const admin = {
  from: () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          single: async () => ({ data: { slug: 'en/about' }, error: null }),
        }),
      }),
    }),
  }),
};
const run = () => publishPageAndPurge(admin as never, scope);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.previous.mockResolvedValue({ id: 'old-version' });
  mocks.target.mockReturnValue({ body: { version: 'old-version' } });
  mocks.publish.mockResolvedValue({
    id: 'new-version',
    status: 'published',
    replaced_page_version_id: 'transaction-prior-version',
  });
  mocks.purge.mockResolvedValue('purged');
});
describe('atomic publication then purge', () => {
  it('purges the pointer returned by the transaction after atomic publish', async () => {
    expect(await run()).toMatchObject({
      id: 'new-version',
      cacheInvalidation: 'purged',
    });
    expect(mocks.target).toHaveBeenCalledWith({
      ...scope,
      slug: 'en/about',
      version: 'new-version',
    });
    expect(mocks.previous).not.toHaveBeenCalled();
    expect(mocks.invalidate).toHaveBeenCalledWith(scope.workspaceId);
    expect(mocks.purge).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { version: 'transaction-prior-version' },
      })
    );
    expect(mocks.publish.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.purge.mock.invocationCallOrder[0] ?? Number.NaN
    );
  });
  it('does not purge if the database rejects publication or audit', async () => {
    const failure = new Error('audit failed');
    mocks.publish.mockRejectedValueOnce(failure);
    await expect(run()).rejects.toBe(failure);
    expect(mocks.purge).not.toHaveBeenCalled();
  });
  it('does not publish on a pointer lookup or configuration error', async () => {
    const failure = new Error('lookup failed');
    mocks.target.mockImplementationOnce(() => {
      throw failure;
    });
    await expect(run()).rejects.toBe(failure);
    expect(mocks.publish).not.toHaveBeenCalled();
    const configurationFailure = new Error('unconfigured');
    mocks.target.mockImplementationOnce(() => {
      throw configurationFailure;
    });
    await expect(run()).rejects.toBe(configurationFailure);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('reports committed publication when the purge fails', async () => {
    mocks.purge.mockResolvedValueOnce('failed');
    expect(await run()).toMatchObject({
      id: 'new-version',
      cacheInvalidation: 'failed',
    });
    expect(mocks.publish).toHaveBeenCalledOnce();
  });
  it('does not purge an absent old version on first publication', async () => {
    mocks.publish.mockResolvedValueOnce({
      id: 'new-version',
      replaced_page_version_id: null,
    });
    expect(await run()).toMatchObject({ cacheInvalidation: 'not-needed' });
    expect(mocks.target).toHaveBeenCalledOnce();
    expect(mocks.purge).not.toHaveBeenCalled();
  });
});
