import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getTranslations: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: mocks.getTranslations,
}));

function compactLinks(links: (NavLink | null)[]) {
  return links.filter((link): link is NavLink => Boolean(link));
}

function flattenLinks(links: (NavLink | null)[]): NavLink[] {
  return compactLinks(links).flatMap((link) => [
    link,
    ...flattenLinks(link.children ?? []),
  ]);
}

describe('Infrastructure navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTranslations.mockResolvedValue((key: string) => `t:${key}`);
  });

  it('returns the expected full top-level operator groups', async () => {
    const { getNavigationLinks } = await import('./navigation');

    const links = compactLinks(
      await getNavigationLinks({ personalOrWsId: 'internal' })
    );

    expect(links.map((link) => link.title)).toEqual([
      't:infrastructure-tabs.overview',
      't:infrastructure-tabs.monitoring',
      't:infrastructure-navigation.groups.ai_operations.title',
      't:infrastructure-navigation.groups.communications.title',
      't:infrastructure-navigation.groups.security.title',
      't:infrastructure-navigation.groups.platform_admin.title',
      't:infrastructure-tabs.operations',
    ]);
  });

  it('covers key nested infrastructure operator routes', async () => {
    const { getNavigationLinks } = await import('./navigation');

    const allLinks = flattenLinks(
      await getNavigationLinks({ personalOrWsId: 'internal' })
    );
    const hrefs = allLinks.map((link) => link.href);

    expect(hrefs).toEqual(
      expect.arrayContaining([
        '/internal/monitoring/cron',
        '/internal/monitoring/resources',
        '/internal/ai-agents',
        '/internal/ai/whitelist/domains',
        '/internal/email-audit',
        '/internal/blocked-ips',
        '/internal/auth-recovery',
        '/internal/users',
        '/internal/workspaces',
        '/internal/external-apps',
        '/internal/mobile-deployment',
        '/internal/app-coordination',
        '/internal/calendar-sync',
      ])
    );
  });

  it('uses translation keys for navigation titles and card descriptions', async () => {
    const { getInfrastructureNavigationCards, getNavigationLinks } =
      await import('./navigation');

    const allLinks = flattenLinks(
      await getNavigationLinks({ personalOrWsId: 'internal' })
    );
    const cards = await getInfrastructureNavigationCards({ wsId: 'internal' });

    expect(allLinks.every((link) => link.title.startsWith('t:'))).toBe(true);
    expect(cards.map((card) => card.description)).toEqual(
      expect.arrayContaining([
        't:infrastructure-navigation.groups.monitoring.description',
        't:infrastructure-navigation.groups.operations.description',
        't:infrastructure-navigation.groups.ai_operations.description',
      ])
    );
  });
});
