import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPermissions: vi.fn(),
  getWorkspace: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  getWorkspace: mocks.getWorkspace,
}));
vi.mock('./_components', () =>
  Object.fromEntries(
    [
      'AICronJobsStats',
      'AIDatasetsStats',
      'AIExecutionsStats',
      'AIPromptsStats',
      'APIKeysStats',
      'CalendarConnectionsStats',
      'CalendarEventsStats',
      'ChatUsageStats',
      'CoursesStats',
      'CrawlersUsageStats',
      'DiscordIntegrationsStats',
      'DocumentsUsageStats',
      'DriveUsageStats',
      'FinanceUsageStats',
      'FlashcardsStats',
      'HabitsUsageStats',
      'InventoryUsageStats',
      'InvoicesUsageStats',
      'LinksUsageStats',
      'ModelsUsageStats',
      'PostsUsageStats',
      'QuizzesStats',
      'SecretsStats',
      'SentEmailsStats',
      'TaskBoardsStats',
      'TaskProjectsStats',
      'TasksUsageStats',
      'TimeTrackingUsageStats',
      'UsageSection',
      'WorkspaceAgeStats',
      'WorkspaceGroupsStats',
      'WorkspaceMembersStats',
      'WorkspaceRolesStats',
    ].map((name) => [name, () => null])
  )
);

import UsageContent from './usage-content';

const permissionsWith = (...granted: string[]) => ({
  containsPermission: (permission: string) => granted.includes(permission),
});

describe('UsageContent access gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getWorkspace.mockResolvedValue({ id: 'ws_1' });
  });

  it('returns not found for a non-member before loading any data', async () => {
    mocks.getPermissions.mockResolvedValue(null);

    await expect(UsageContent({ wsId: 'ws_1' })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
    expect(mocks.getWorkspace).not.toHaveBeenCalled();
  });

  it('returns not found for a member without the usage permission', async () => {
    mocks.getPermissions.mockResolvedValue(
      permissionsWith('manage_workspace_settings')
    );

    await expect(UsageContent({ wsId: 'ws_1' })).rejects.toThrow(
      'NEXT_NOT_FOUND'
    );
    expect(mocks.getWorkspace).not.toHaveBeenCalled();
  });

  it('renders usage for a member with the usage permission', async () => {
    mocks.getPermissions.mockResolvedValue(
      permissionsWith('manage_workspace_members')
    );

    await expect(UsageContent({ wsId: 'ws_1' })).resolves.toBeTruthy();
    expect(mocks.getWorkspace).toHaveBeenCalledWith('ws_1');
  });
});

describe('usage stats reachability', () => {
  it('imports the ungated stat components only from the gated usage content', () => {
    const srcRoot = resolve(__dirname, '../../../../../..');
    const importers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          if (entry !== 'node_modules') walk(path);
        } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry)) {
          const source = readFileSync(path, 'utf8');
          const importsUsageStats =
            /usage\/_components/.test(source) ||
            (path.includes('/(workspace-settings)/usage/') &&
              /from '\.\/_components'/.test(source));
          if (importsUsageStats) {
            importers.push(path.slice(srcRoot.length + 1));
          }
        }
      }
    };
    walk(srcRoot);
    expect(importers).toEqual([
      'app/[locale]/(dashboard)/[wsId]/(workspace-settings)/usage/usage-content.tsx',
    ]);
  });
});
