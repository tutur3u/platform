import { describe, expect, it } from 'vitest';

import { getInventoryNavigationItems } from './navigation-data';

describe('Inventory navigation', () => {
  it('keeps legacy route aliases and grouped sidebar sections', () => {
    const links = getInventoryNavigationItems({ workspaceSlug: 'acme' });
    const visibleLinks = links.filter((link) => link !== null);

    expect(links.filter((link) => link === null)).toHaveLength(4);
    expect(links.slice(0, 4)).toEqual([
      expect.objectContaining({ href: '/acme' }),
      null,
      expect.objectContaining({ href: '/acme/analytics' }),
      null,
    ]);
    expect(visibleLinks[0]).toMatchObject({
      href: '/acme',
      matchExact: true,
      titleKey: 'overview.title',
    });
    expect(visibleLinks.map((link) => link.href)).toEqual([
      '/acme',
      '/acme/analytics',
      '/acme/catalog',
      '/acme/stock',
      '/acme/bundles',
      '/acme/costing',
      '/acme/commerce',
      '/acme/sales',
      '/acme/promotions',
      '/acme/storefront',
      '/acme/payments',
      '/acme/pos-devices',
      '/acme/setup',
      '/acme/audits',
    ]);
    expect(visibleLinks[2]).toMatchObject({
      aliases: ['/acme/items'],
      sectionKey: 'sections.operations',
    });
    expect(visibleLinks[6]).toMatchObject({
      aliases: ['/acme/checkout', '/acme/checkouts'],
      sectionKey: 'sections.commerce',
      titleKey: 'commerce.title',
    });
    expect(visibleLinks[7]).toMatchObject({
      href: '/acme/sales',
      icon: 'sales',
      titleKey: 'sales.title',
    });
    expect(visibleLinks[8]).toMatchObject({
      href: '/acme/promotions',
      icon: 'promotions',
      titleKey: 'promotions.title',
    });
    expect(visibleLinks[9]).toMatchObject({
      aliases: ['/acme/storefront/preview', '/acme/stripe'],
    });
    expect(visibleLinks[10]).toMatchObject({
      aliases: ['/acme/polar'],
      href: '/acme/payments',
      titleKey: 'payments.title',
    });
    expect(visibleLinks[11]).toMatchObject({
      aliases: ['/acme/terminals'],
      href: '/acme/pos-devices',
      icon: 'posDevices',
      titleKey: 'posDevices.title',
    });
    expect(visibleLinks[12]).toMatchObject({
      sectionKey: 'sections.controls',
    });
  });
});
