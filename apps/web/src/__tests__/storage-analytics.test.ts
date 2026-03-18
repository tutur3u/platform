import { describe, expect, it } from 'vitest';
import {
  countWorkspaceStorageObjects,
  getWorkspaceStorageMetrics,
} from '@/lib/storage-analytics';

describe('storage analytics', () => {
  const supabase = {
    storage: {
      from: () => ({
        list: async (path: string) => {
          if (path === 'ws-1') {
            return {
              data: [
                { name: 'documents' },
                {
                  id: 'file-1',
                  name: 'root.txt',
                  metadata: { size: 10 },
                  created_at: '2026-03-18T00:00:00.000Z',
                },
                { name: '.emptyFolderPlaceholder' },
              ],
              error: null,
            };
          }

          if (path === 'ws-1/documents') {
            return {
              data: [
                {
                  id: 'file-2',
                  name: 'report.pdf',
                  metadata: { size: 200 },
                  created_at: '2026-03-18T01:00:00.000Z',
                },
                {
                  id: 'file-3',
                  name: 'tiny.txt',
                  metadata: { size: 1 },
                  created_at: '2026-03-18T02:00:00.000Z',
                },
              ],
              error: null,
            };
          }

          return {
            data: [],
            error: null,
          };
        },
      }),
    },
  };

  it('walks storage through the Storage API and computes metrics', async () => {
    const metrics = await getWorkspaceStorageMetrics(supabase, 'ws-1');

    expect(metrics).toEqual({
      fileCount: 3,
      largestFile: {
        name: 'report.pdf',
        size: 200,
        createdAt: '2026-03-18T01:00:00.000Z',
      },
      smallestFile: {
        name: 'tiny.txt',
        size: 1,
        createdAt: '2026-03-18T02:00:00.000Z',
      },
    });
  });

  it('counts nested storage files with optional search filtering', async () => {
    await expect(countWorkspaceStorageObjects(supabase, 'ws-1')).resolves.toBe(
      3
    );
    await expect(
      countWorkspaceStorageObjects(supabase, 'ws-1', { search: 'report' })
    ).resolves.toBe(1);
  });
});
