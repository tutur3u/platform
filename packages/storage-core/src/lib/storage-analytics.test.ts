import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { describe, expect, it, vi } from 'vitest';
import { MOBILE_DEPLOYMENT_DRIVE_PREFIX } from './mobile-deployment/constants';
import { getWorkspaceStorageMetrics } from './storage-analytics';

describe('private app-managed storage accounting', () => {
  it('keeps reserved artifacts out of Drive browsing but counts their bytes for quota', async () => {
    const segments = MOBILE_DEPLOYMENT_DRIVE_PREFIX.split('/');
    const list = vi.fn(async (path: string) => {
      const relative =
        path === ROOT_WORKSPACE_ID
          ? ''
          : path.slice(ROOT_WORKSPACE_ID.length + 1);
      const depth = relative ? relative.split('/').length : 0;
      const data: Array<{
        id?: string;
        name: string;
        metadata?: { size: number };
      }> =
        depth < segments.length
          ? [{ name: segments[depth]! }]
          : [
              {
                id: 'private-file',
                name: 'release.apk',
                metadata: { size: 900 },
              },
            ];
      if (depth === 0)
        data.push(
          {
            id: 'public-file',
            name: 'notes.txt',
            metadata: { size: 100 },
          },
          {
            id: 'double-dot-filename',
            name: 'v1..final.pdf',
            metadata: { size: 50 },
          }
        );
      return { data, error: null };
    });
    const client = { storage: { from: () => ({ list }) } };
    const visible = await getWorkspaceStorageMetrics(client, ROOT_WORKSPACE_ID);
    const quota = await getWorkspaceStorageMetrics(
      client,
      ROOT_WORKSPACE_ID,
      true
    );
    expect(visible.totalSize).toBe(150);
    expect(visible.largestFile?.name).toBe('notes.txt');
    expect(quota.totalSize).toBe(1050);
  });
});

it('omits private chat names and sizes from Drive analytics while retaining quota usage', async () => {
  const list = vi.fn(async (path: string) => ({
    error: null,
    data:
      path === 'ws-1'
        ? [
            { name: 'chats' },
            { id: 'drive', name: 'notes.txt', metadata: { size: 100 } },
          ]
        : [
            {
              id: 'private',
              name: 'private-mind-attachment.pdf',
              metadata: { size: 900 },
            },
          ],
  }));
  const client = { storage: { from: () => ({ list }) } };
  const visible = await getWorkspaceStorageMetrics(client, 'ws-1');
  expect(visible).toMatchObject({
    totalSize: 100,
    fileCount: 1,
    largestFile: { name: 'notes.txt' },
    smallestFile: { name: 'notes.txt' },
  });
  expect(
    (await getWorkspaceStorageMetrics(client, 'ws-1', true)).totalSize
  ).toBe(1000);
});
