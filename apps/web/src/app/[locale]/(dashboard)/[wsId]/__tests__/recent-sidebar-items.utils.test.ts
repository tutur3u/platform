import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { describe, expect, it } from 'vitest';
import {
  normalizeRecentSidebarEntries,
  removeRecentSidebarEntry,
  resolveRecentSidebarEntry,
  resolveRecentSidebarItem,
  upsertRecentSidebarEntry,
} from '../recent-sidebar-items.utils';

const labels = {
  archivedBadge: 'Archived',
  debtItem: 'Debt',
  invoiceItem: 'Invoice',
  projectItem: 'Project',
  taskBoardItem: 'Task board',
  taskItem: 'Task',
  templateItem: 'Template',
  transactionItem: 'Transaction',
  walletItem: 'Wallet',
  whiteboardItem: 'Whiteboard',
};

const links: (NavLink | null)[] = [
  {
    title: 'Tasks',
    href: '/personal/tasks',
    children: [
      {
        title: 'Boards',
        href: '/personal/tasks/boards',
      },
      {
        title: 'Projects',
        href: '/personal/tasks/projects',
      },
    ],
  },
  {
    title: 'Whiteboards',
    href: '/personal/whiteboards',
  },
  {
    title: 'Finance',
    href: '/personal/finance',
    children: [
      {
        title: 'Wallets',
        href: '/personal/finance/wallets',
      },
      {
        title: 'Invoices',
        href: '/personal/finance/invoices',
      },
    ],
  },
];

describe('recent-sidebar-items utils', () => {
  it('resolves static tab routes from navigation links', () => {
    expect(
      resolveRecentSidebarItem('/personal/finance/wallets', links, labels)
    ).toMatchObject({
      badges: [],
      title: 'Wallets',
      subtitle: 'Finance',
      iconKey: 'wallet',
    });
  });

  it('resolves dynamic detail routes with readable labels', () => {
    expect(
      resolveRecentSidebarItem(
        '/personal/tasks/boards/4a14d1b2-d5d2-451e-a790-eb8aae3d9359',
        links,
        labels
      )
    ).toMatchObject({
      badges: [],
      title: 'Task board 3d9359',
      subtitle: 'Boards',
      iconKey: 'task-board',
    });

    expect(
      resolveRecentSidebarItem(
        '/personal/whiteboards/customer-journey-map',
        links,
        labels
      )
    ).toMatchObject({
      badges: [],
      title: 'Whiteboard customer journey map',
      subtitle: 'Whiteboards',
      iconKey: 'whiteboard',
    });
  });

  it('prefers stored snapshots for board and task detail items', () => {
    expect(
      resolveRecentSidebarEntry(
        {
          href: '/personal/tasks/boards/4a14d1b2-d5d2-451e-a790-eb8aae3d9359',
          snapshot: {
            badges: [
              { kind: 'ticket-prefix', value: 'ops' },
              { kind: 'archived' },
            ],
            iconKey: 'task-board',
            title: 'Operations',
          },
          visitedAt: '2026-03-03T03:00:00.000Z',
        },
        links,
        labels
      )
    ).toMatchObject({
      badges: [
        { label: 'OPS', tone: 'feature' },
        { label: 'Archived', tone: 'warning' },
      ],
      title: 'Operations',
    });

    expect(
      resolveRecentSidebarEntry(
        {
          href: '/personal/tasks/task-123',
          snapshot: {
            badges: [
              { kind: 'board', value: 'Tuverse' },
              { kind: 'list', value: 'Backlog' },
            ],
            iconKey: 'task',
            title: 'Persist Mira form submission UI',
          },
          visitedAt: '2026-03-03T03:05:00.000Z',
        },
        links,
        labels
      )
    ).toMatchObject({
      badges: [
        { label: 'Tuverse', tone: 'default' },
        { label: 'Backlog', tone: 'default' },
      ],
      title: 'Persist Mira form submission UI',
    });
  });

  it('deduplicates and removes recent entries by href', () => {
    const entries = upsertRecentSidebarEntry(
      [
        {
          href: '/personal/tasks',
          visitedAt: '2026-03-03T00:00:00.000Z',
        },
        {
          href: '/personal/whiteboards',
          visitedAt: '2026-03-02T00:00:00.000Z',
        },
      ],
      '/personal/tasks',
      '2026-03-03T01:00:00.000Z'
    );

    expect(entries).toEqual([
      {
        href: '/personal/tasks',
        visitedAt: '2026-03-03T01:00:00.000Z',
      },
      {
        href: '/personal/whiteboards',
        visitedAt: '2026-03-02T00:00:00.000Z',
      },
    ]);

    expect(removeRecentSidebarEntry(entries, '/personal/tasks')).toEqual([
      {
        href: '/personal/whiteboards',
        visitedAt: '2026-03-02T00:00:00.000Z',
      },
    ]);
  });

  it('merges snapshots when a richer visit arrives for an existing href', () => {
    const entries = upsertRecentSidebarEntry(
      [
        {
          href: '/personal/tasks/task-123',
          snapshot: {
            iconKey: 'task',
            title: 'Task 123',
          },
          visitedAt: '2026-03-03T00:00:00.000Z',
        },
      ],
      {
        href: '/personal/tasks/task-123',
        snapshot: {
          badges: [{ kind: 'board', value: 'Tuverse' }],
        },
        visitedAt: '2026-03-03T01:00:00.000Z',
      }
    );

    expect(entries).toEqual([
      {
        href: '/personal/tasks/task-123',
        snapshot: {
          badges: [{ kind: 'board', value: 'Tuverse' }],
          iconKey: 'task',
          title: 'Task 123',
        },
        visitedAt: '2026-03-03T01:00:00.000Z',
      },
    ]);
  });

  it('normalizes internal UUID routes to the current workspace slug for dedupe', () => {
    expect(
      normalizeRecentSidebarEntries(
        [
          {
            href: '/00000000-0000-0000-0000-000000000000/tasks/task-123',
            visitedAt: '2026-03-03T00:00:00.000Z',
          },
          {
            href: '/internal/tasks/task-123',
            visitedAt: '2026-03-03T01:00:00.000Z',
          },
        ],
        {
          currentPathname: '/internal/tasks',
          wsId: '00000000-0000-0000-0000-000000000000',
        }
      )
    ).toEqual([
      {
        href: '/internal/tasks/task-123',
        visitedAt: '2026-03-03T01:00:00.000Z',
      },
    ]);
  });
});
