import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSidebarAppLinks, type SidebarAppsInput } from './sidebar-apps';

const registry = vi.hoisted(() => ({ whiteboards: false }));

vi.mock('@tuturuuu/utils/launchable-apps', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/launchable-apps')>();

  return {
    ...actual,
    getLaunchableApp: (slug: string) =>
      slug === 'whiteboards'
        ? registry.whiteboards
          ? {
              aliases: [],
              appRoot: 'apps/whiteboards',
              category: 'productivity',
              defaultPath: '/',
              packageName: '@tuturuuu/whiteboards',
              portlessApp: 'platform',
              productionUrl: 'https://whiteboards.tuturuuu.com',
              slug: 'whiteboards',
              title: 'Whiteboards',
            }
          : null
        : actual.getLaunchableApp(slug),
  };
});

const slugs = [
  'ai',
  'calendar',
  'chat',
  'contacts',
  'documents',
  'drive',
  'finance',
  'forms',
  'hive',
  'inventory',
  'mail',
  'meet',
  'mind',
  'shortener',
  'tasks',
  'tools',
  'track',
] as const;

const input: SidebarAppsInput = {
  ENABLE_AI_ONLY: false,
  hasSecret: () => true,
  isMailUser: true,
  isPersonal: true,
  personalOrWsId: 'personal',
  resolvedWorkspaceId: 'workspace-id',
  rootWorkspaceId: ROOT_WORKSPACE_ID,
  titles: Object.fromEntries(slugs.map((slug) => [slug, slug])) as {
    [slug in (typeof slugs)[number]]: string;
  },
  documentsPageTitles: {
    notes: 'Notes',
    personalJournal: 'Personal journal',
    whiteboards: 'Whiteboards',
  },
  withoutPermission: () => false,
};

describe('whiteboards entry', () => {
  afterEach(() => {
    registry.whiteboards = false;
  });

  it('is a Documents page while the registry has no whiteboards app', () => {
    const links = createSidebarAppLinks(input);

    expect(links.find((link) => link.id === 'whiteboards')).toBeUndefined();
    expect(
      links
        .find((link) => link.id === 'documents')
        ?.children?.some((child) => child?.title === 'Whiteboards')
    ).toBe(true);
  });

  it('becomes its own top-level entry once the registry lists it', () => {
    registry.whiteboards = true;
    const links = createSidebarAppLinks(input);

    expect(links.find((link) => link.id === 'whiteboards')).toMatchObject({
      appSlug: 'whiteboards',
      external: true,
    });
    expect(
      links
        .find((link) => link.id === 'documents')
        ?.children?.some((child) => child?.title === 'Whiteboards')
    ).toBe(false);
  });
});
