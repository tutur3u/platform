import {
  createEmptyCmsPage,
  toCmsPageVersionPayload,
} from '@tuturuuu/cms-blocks/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  flag: vi.fn(),
  save: vi.fn(),
  publish: vi.fn(),
}));
vi.mock('@/lib/external-projects/access', () => ({
  getCmsWorkspaceAccess: mocks.access,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getWorkspaceConfig: mocks.flag,
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@tuturuuu/internal-api', () => ({
  withForwardedInternalApiAuth: () => ({ forwarded: true }),
  saveWorkspaceExternalProjectPageVersion: mocks.save,
  publishWorkspaceExternalProjectPageVersion: mocks.publish,
}));

import { publishCmsPage, saveCmsPageDraft } from './page-version-actions';

const payload = toCmsPageVersionPayload(createEmptyCmsPage('First site'));
const id = '11111111-1111-4111-8111-111111111111';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({
    canAccessWorkspace: true,
    canPublishPages: false,
    normalizedWorkspaceId: 'normalized',
  });
  mocks.flag.mockResolvedValue('true');
  mocks.save.mockResolvedValue({ id });
});
describe('page builder server actions', () => {
  it('lets an editor save but denies forged publish invocations', async () => {
    await saveCmsPageDraft('ws', 'entry', payload);
    expect(mocks.save).toHaveBeenCalledWith(
      'normalized',
      'entry',
      { data: payload.data, schemaVersion: payload.schema_version },
      { forwarded: true }
    );
    await expect(publishCmsPage('ws', 'entry', payload)).rejects.toMatchObject({
      message: 'Forbidden',
    });
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.publish).not.toHaveBeenCalled();
  });
  it('publishes the saved version as a publisher', async () => {
    mocks.access.mockResolvedValue({
      canAccessWorkspace: true,
      canPublishPages: true,
      normalizedWorkspaceId: 'normalized',
    });
    await publishCmsPage('ws', 'entry', payload);
    expect(mocks.publish).toHaveBeenCalledWith('normalized', 'entry', id, {
      forwarded: true,
    });
  });
  it('denies a non-member before saving', async () => {
    mocks.access.mockResolvedValue({ canAccessWorkspace: false });
    await expect(
      saveCmsPageDraft('ws', 'entry', payload)
    ).rejects.toMatchObject({ message: 'Forbidden' });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('does not write after permission or feature-flag lookup failure', async () => {
    const error = new Error('lookup failed');
    mocks.access.mockRejectedValueOnce(error);
    await expect(saveCmsPageDraft('ws', 'entry', payload)).rejects.toBe(error);
    mocks.flag.mockResolvedValueOnce('false');
    await expect(
      saveCmsPageDraft('ws', 'entry', payload)
    ).rejects.toMatchObject({ message: 'Page builder unavailable' });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('does not publish if saving the draft fails', async () => {
    mocks.access.mockResolvedValue({
      canAccessWorkspace: true,
      canPublishPages: true,
      normalizedWorkspaceId: 'normalized',
    });
    const error = new Error('save failed');
    mocks.save.mockRejectedValueOnce(error);
    await expect(publishCmsPage('ws', 'entry', payload)).rejects.toBe(error);
    expect(mocks.publish).not.toHaveBeenCalled();
  });
});
