import { describe, expect, it } from 'vitest';

import { getInventoryNavigationItems } from './navigation-data';

describe('Inventory navigation', () => {
  it('keeps legacy route aliases and grouped sidebar sections', () => {
    const links = getInventoryNavigationItems({ workspaceSlug: 'acme' });
    const visibleLinks = links.filter((link) => link !== null);

    expect(links.filter((link) => link === null)).toHaveLength(3);
    expect(visibleLinks[0]).toMatchObject({
      href: '/acme',
      matchExact: true,
      titleKey: 'overview.title',
    });
    expect(visibleLinks.map((link) => link.href)).toEqual([
      '/acme',
      '/acme/catalog',
      '/acme/stock',
      '/acme/bundles',
      '/acme/costing',
      '/acme/commerce',
      '/acme/promotions',
      '/acme/storefront',
      '/acme/payments',
      '/acme/setup',
      '/acme/audits',
    ]);
    expect(visibleLinks[1]).toMatchObject({
      aliases: ['/acme/items'],
      sectionKey: 'sections.operations',
    });
    expect(visibleLinks[5]).toMatchObject({
      aliases: ['/acme/checkout', '/acme/checkouts', '/acme/sales'],
      sectionKey: 'sections.commerce',
      titleKey: 'commerce.title',
    });
    expect(visibleLinks[6]).toMatchObject({
      href: '/acme/promotions',
      icon: 'promotions',
      titleKey: 'promotions.title',
    });
    expect(visibleLinks[7]).toMatchObject({
      aliases: ['/acme/storefront/preview', '/acme/stripe'],
    });
    expect(visibleLinks[8]).toMatchObject({
      aliases: ['/acme/polar'],
      href: '/acme/payments',
      titleKey: 'payments.title',
    });
    expect(visibleLinks[9]).toMatchObject({
      sectionKey: 'sections.controls',
    });
  });
});
