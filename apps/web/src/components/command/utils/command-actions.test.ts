import { describe, expect, it } from 'vitest';
import type { NavLink } from '@/components/navigation';
import { buildCommandActions } from './command-actions';
import { flattenNavigation } from './use-navigation-data';

describe('command navigation actions', () => {
  it('flattens permitted navigation with product context', () => {
    const navLinks: (NavLink | null)[] = [
      {
        id: 'tasks',
        title: 'Tasks',
        href: '/acme/tasks',
        children: [
          {
            title: 'Boards',
            href: '/acme/tasks/boards',
          },
          {
            title: 'Logs',
            href: '/acme/tasks/logs',
            disabled: true,
          },
        ],
      },
      null,
      {
        id: 'qr_generator',
        title: 'QR Generator',
        href: 'https://qr.example.com',
        external: true,
        newTab: true,
      },
    ];

    const flattened = flattenNavigation(navLinks);

    expect(flattened.map((item) => item.href)).toEqual([
      '/acme/tasks',
      '/acme/tasks/boards',
      'https://qr.example.com',
    ]);
    expect(flattened[1]).toMatchObject({
      path: ['Tasks', 'Boards'],
      productId: 'tasks',
      productTitle: 'Tasks',
      productHref: '/acme/tasks',
    });
    expect(flattened[2]).toMatchObject({
      external: true,
      newTab: true,
      productId: 'qr_generator',
    });
  });

  it('builds smart actions for visible products', () => {
    const navItems = flattenNavigation([
      {
        id: 'tasks',
        title: 'Tasks',
        href: '/acme/tasks',
      },
      {
        id: 'finance',
        title: 'Finance',
        href: '/acme/finance',
        children: [
          {
            title: 'Invoices',
            href: '/acme/finance/invoices',
          },
        ],
      },
      {
        id: 'qr_generator',
        title: 'QR Generator',
        href: 'https://qr.example.com',
        external: true,
      },
    ]);

    const actions = buildCommandActions(navItems);

    expect(
      actions.find((action) => action.id === 'create-tasks')
    ).toMatchObject({
      kind: 'panel',
      panel: 'task-create',
      targetHref: '/acme/tasks',
    });
    expect(
      actions.find((action) => action.id === 'create-finance')
    ).toMatchObject({
      kind: 'panel',
      panel: 'generic',
      targetHref: '/acme/finance/transactions?create=transaction',
    });
    expect(
      actions.find((action) => action.id === 'open-qr_generator')
    ).toMatchObject({
      kind: 'external',
      targetHref: 'https://qr.example.com',
    });
    expect(actions.some((action) => action.id === 'create-qr_generator')).toBe(
      false
    );
    expect(
      actions
        .find((action) => action.id === 'create-finance')
        ?.aliases.includes('Invoices')
    ).toBe(true);
  });
});
