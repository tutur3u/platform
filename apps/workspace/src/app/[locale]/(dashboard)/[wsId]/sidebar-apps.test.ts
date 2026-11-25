import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { LAUNCHABLE_APPS } from '@tuturuuu/utils/launchable-apps';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSidebarAppLinks, type SidebarAppsInput } from './sidebar-apps';

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

function input(overrides: Partial<SidebarAppsInput> = {}): SidebarAppsInput {
  return {
    ENABLE_AI_ONLY: false,
    hasSecret: () => true,
    isMailUser: true,
    isPersonal: true,
    personalOrWsId: 'personal',
    resolvedWorkspaceId: 'workspace-id',
    rootWorkspaceId: ROOT_WORKSPACE_ID,
    titles: Object.fromEntries(
      slugs.map((slug) => [slug, `title-${slug}`])
    ) as {
      [slug in (typeof slugs)[number]]: string;
    },
    documentsPageTitles: {
      notes: 'Notes',
      personalJournal: 'Personal journal',
      whiteboards: 'Whiteboards',
    },
    withoutPermission: () => false,
    ...overrides,
  };
}

function find(links: ReturnType<typeof createSidebarAppLinks>, id: string) {
  return links.find((link) => link.id === id);
}

describe('sidebar app entries', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', '');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('lists one entry per registered app and nothing else at the root', () => {
    const links = createSidebarAppLinks(input());
    const appSlugs = links.map((link) => link.appSlug);

    expect(new Set(appSlugs).size).toBe(appSlugs.length);
    expect(appSlugs.sort()).toEqual([...slugs].sort());
    for (const slug of appSlugs) {
      expect(LAUNCHABLE_APPS.map((app) => app.slug)).toContain(slug);
    }
    for (const innerPage of [
      'notes',
      'personal_journal',
      'whiteboards',
      'habits',
      'workforce',
      'posts',
      'polls',
      'google_workspace',
    ]) {
      expect(find(links, innerPage)).toBeUndefined();
    }
  });

  it('opens each satellite app at the URL the registry resolves', () => {
    const links = createSidebarAppLinks(input());

    expect(find(links, 'tasks')?.href).toBe(
      'https://tasks.tuturuuu.com/personal/tasks'
    );
    expect(find(links, 'meet')?.href).toBe(
      'https://meet.tuturuuu.com/workspace/personal'
    );
    expect(find(links, 'hive')?.href).toBe('https://hive.tuturuuu.com/');
  });

  it('follows the registry when an app moves to its apex path', () => {
    vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', 'tasks,mail');
    const links = createSidebarAppLinks(input());

    expect(find(links, 'tasks')?.href).toBe(
      'https://tuturuuu.com/tasks/personal/tasks'
    );
    expect(find(links, 'mail')?.href).toBe(
      'https://tuturuuu.com/mail/personal'
    );
    expect(find(links, 'calendar')?.href).toBe(
      'https://calendar.tuturuuu.com/personal'
    );
  });

  describe('against the active Web mount list', () => {
    const activeMounts =
      'calendar,contacts,finance,infra,learn,mail,meet,nova,teach';

    it('puts mounted apps on their apex path and the rest on their subdomain', () => {
      vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', activeMounts);
      const links = createSidebarAppLinks(input());

      expect(find(links, 'mail')?.href).toBe(
        'https://tuturuuu.com/mail/personal'
      );
      expect(find(links, 'finance')?.href).toBe(
        'https://tuturuuu.com/finance/personal'
      );
      expect(find(links, 'calendar')?.href).toBe(
        'https://tuturuuu.com/calendar/personal'
      );
      expect(find(links, 'contacts')?.href).toBe(
        'https://tuturuuu.com/contacts/personal'
      );
      expect(find(links, 'meet')?.href).toBe(
        'https://tuturuuu.com/meet/workspace/personal'
      );
      expect(find(links, 'tasks')?.href).toBe(
        'https://tasks.tuturuuu.com/personal/tasks'
      );
      expect(find(links, 'time_tracker')?.href).toBe(
        'https://track.tuturuuu.com/personal'
      );
      expect(find(links, 'qr_generator')?.href).toBe(
        'https://tools.tuturuuu.com/'
      );
    });

    it('moves added names to their apex path at cutover without a sidebar change', () => {
      vi.stubEnv(
        'NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS',
        `${activeMounts},tasks,track,tools,drive`
      );
      const links = createSidebarAppLinks(input());

      expect(find(links, 'tasks')?.href).toBe(
        'https://tuturuuu.com/tasks/personal/tasks'
      );
      expect(find(links, 'time_tracker')?.href).toBe(
        'https://tuturuuu.com/track/personal'
      );
      expect(find(links, 'qr_generator')?.href).toBe(
        'https://tuturuuu.com/tools'
      );
      expect(find(links, 'drive')?.href).toBe(
        'https://tuturuuu.com/drive/personal'
      );
    });

    it('keeps platform-hosted apps on platform paths whatever is mounted', () => {
      vi.stubEnv('NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS', activeMounts);
      const links = createSidebarAppLinks(input());

      expect(find(links, 'documents')?.href).toBe('/personal/documents');
      expect(find(links, 'link_shortener')?.href).toBe(
        '/personal/link-shortener'
      );
    });
  });

  it('resolves Portless hosts from the request origin in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const links = createSidebarAppLinks(
      input({ currentOrigin: 'https://tuturuuu.localhost:1355' })
    );

    expect(find(links, 'tasks')?.href).toBe(
      'https://tasks.tuturuuu.localhost:1355/personal/tasks'
    );
  });

  it('keeps platform-hosted apps on platform paths', () => {
    const links = createSidebarAppLinks(input());

    expect(find(links, 'documents')?.href).toBe('/personal/documents');
    expect(find(links, 'link_shortener')?.href).toBe(
      '/personal/link-shortener'
    );
  });

  it('puts notes, journal and whiteboards under Documents', () => {
    const documents = find(createSidebarAppLinks(input()), 'documents');

    expect(documents?.children?.map((child) => child?.title)).toEqual([
      'title-documents',
      'Notes',
      'Personal journal',
      'Whiteboards',
    ]);
    expect(
      find(
        createSidebarAppLinks(input({ isPersonal: false })),
        'documents'
      )?.children?.find((child) => child?.title === 'Personal journal')
    ).toMatchObject({ disabled: true });
  });

  it('keeps permission, plan and feature gating on every entry', () => {
    const denied = createSidebarAppLinks(
      input({
        ENABLE_AI_ONLY: true,
        hasSecret: () => false,
        isMailUser: false,
        withoutPermission: () => true,
      })
    );

    for (const id of [
      'tasks',
      'calendar',
      'time_tracker',
      'forms',
      'documents',
      'mail',
      'chat',
      'contacts',
      'finance',
      'inventory',
      'drive',
      'ai_lab',
      'link_shortener',
    ]) {
      expect(find(denied, id)?.disabled, id).toBe(true);
    }
    expect(find(denied, 'meet')?.disabled).toBeUndefined();
    expect(find(denied, 'documents')?.requiredWorkspaceTier).toBeDefined();
    expect(find(denied, 'chat')?.requiredWorkspaceTier).toBeDefined();
  });
});
