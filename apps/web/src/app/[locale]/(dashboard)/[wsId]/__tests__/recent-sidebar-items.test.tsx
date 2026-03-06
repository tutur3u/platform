import { render, screen, waitFor } from '@testing-library/react';
import type { NavLink } from '@tuturuuu/ui/custom/navigation';
import { dispatchRecentSidebarVisit } from '@tuturuuu/ui/tu-do/shared/recent-sidebar-events';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecentSidebarItems } from '../recent-sidebar-items';
import type { RecentSidebarEntry } from '../recent-sidebar-items.utils';

let mockPathname = '/personal/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    key === 'sidebar_recent_items.show_more'
      ? `${key}:${values?.count ?? ''}`
      : key,
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@tuturuuu/ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@tuturuuu/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@tuturuuu/icons', () => {
  const Icon = () => <svg aria-hidden="true" />;

  return {
    Banknote: Icon,
    ChevronDown: Icon,
    ChevronUp: Icon,
    FolderKanban: Icon,
    History: Icon,
    LayoutDashboard: Icon,
    PencilRuler: Icon,
    ReceiptText: Icon,
    Trash2: Icon,
    Wallet: Icon,
    X: Icon,
  };
});

const links: (NavLink | null)[] = [
  {
    title: 'Tasks',
    href: '/personal/tasks',
  },
  {
    title: 'Wallets',
    href: '/personal/finance/wallets',
  },
];

const wsId = 'personal';
const storageKey = `tuturuuu:sidebar-recent-items:${wsId}`;

function renderSidebar() {
  return render(
    <RecentSidebarItems
      isCollapsed={false}
      links={links}
      onNavigate={vi.fn()}
      wsId={wsId}
    />
  );
}

function readStoredEntries() {
  const value = window.localStorage.getItem(storageKey);
  return value ? (JSON.parse(value) as RecentSidebarEntry[]) : [];
}

describe('RecentSidebarItems', () => {
  beforeEach(() => {
    mockPathname = '/personal/dashboard';
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('does not rebroadcast on mount when stored entries are already normalized', async () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify([
        {
          href: '/personal/tasks',
          visitedAt: '2026-03-03T02:00:00.000Z',
        },
        {
          href: '/personal/finance/wallets',
          visitedAt: '2026-03-03T01:00:00.000Z',
        },
      ])
    );
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    renderSidebar();

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /tasks/i })).toBeTruthy();
      expect(screen.getByRole('link', { name: /wallets/i })).toBeTruthy();
    });

    expect(readStoredEntries()).toEqual([
      {
        href: '/personal/tasks',
        visitedAt: '2026-03-03T02:00:00.000Z',
      },
      {
        href: '/personal/finance/wallets',
        visitedAt: '2026-03-03T01:00:00.000Z',
      },
    ]);

    const sidebarUpdateEvents = dispatchSpy.mock.calls.filter(([event]) => {
      return (
        event instanceof CustomEvent &&
        event.type === 'tuturuuu:sidebar-recent-items-updated'
      );
    });

    expect(sidebarUpdateEvents).toHaveLength(0);
  });

  it('syncs same-tab recent visits across sidebar instances without duplicates', async () => {
    renderSidebar();
    renderSidebar();

    dispatchRecentSidebarVisit({
      href: '/personal/tasks',
      scopeWsId: wsId,
    });

    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: /tasks/i })).toHaveLength(2);
    });

    expect(readStoredEntries()).toEqual([
      {
        href: '/personal/tasks',
        visitedAt: expect.any(String),
      },
    ]);
  });
});
