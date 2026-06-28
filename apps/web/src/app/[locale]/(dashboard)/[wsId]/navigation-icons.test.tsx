// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DashboardNavigationIcon } from './navigation-icons';

vi.mock('@tuturuuu/icons/lucide', async () => {
  const React = await import('react');
  const NavigationIcon = ({ className }: { className?: string }) =>
    React.createElement('svg', {
      className,
      'data-testid': 'navigation-icon',
    });
  const iconNames = [
    'Archive',
    'ArrowLeft',
    'BadgeDollarSign',
    'Banknote',
    'Bell',
    'Blocks',
    'Bolt',
    'BookKey',
    'Bookmark',
    'BookOpenCheck',
    'BookText',
    'BookUser',
    'Bot',
    'Box',
    'Boxes',
    'BrainCircuit',
    'BriefcaseBusiness',
    'Calendar',
    'CalendarClock',
    'Cctv',
    'ChartArea',
    'ChartColumn',
    'ChartColumnStacked',
    'ChartGantt',
    'CheckCircle2',
    'CircleDollarSign',
    'ClipboardClock',
    'ClipboardList',
    'Clock',
    'ClockCheck',
    'ClockFading',
    'CreditCard',
    'Database',
    'FileEdit',
    'FileText',
    'FolderSync',
    'GalleryVerticalEnd',
    'Gauge',
    'GraduationCap',
    'Group',
    'HandCoins',
    'HardDrive',
    'IdCardLanyard',
    'KeyRound',
    'Languages',
    'LayoutDashboard',
    'LayoutList',
    'Link',
    'Logs',
    'Mail',
    'MailCheck',
    'Mails',
    'MailX',
    'Megaphone',
    'MessageCircleIcon',
    'Package',
    'PencilRuler',
    'Play',
    'Plus',
    'QrCodeIcon',
    'Radio',
    'ReceiptText',
    'RefreshCw',
    'Repeat',
    'RulerDimensionLine',
    'ScanSearch',
    'ScreenShare',
    'ScrollText',
    'Send',
    'Settings',
    'ShieldAlert',
    'ShieldBan',
    'ShieldUser',
    'Smartphone',
    'Sparkle',
    'Sparkles',
    'SquareChevronRight',
    'SquareKanban',
    'SquaresIntersect',
    'SquareUserRound',
    'Star',
    'Store',
    'Tags',
    'TextSelect',
    'TicketPercent',
    'Timer',
    'Trash',
    'TriangleAlert',
    'Truck',
    'Upload',
    'UserCheck',
    'UserLock',
    'UserStar',
    'Users',
    'VectorSquare',
    'Vote',
    'Wallet',
    'Warehouse',
  ];

  return {
    ...Object.fromEntries(iconNames.map((name) => [name, NavigationIcon])),
    Icon: NavigationIcon,
  };
});

vi.mock('@tuturuuu/icons/lab', () => ({
  hexagons3: [],
}));

describe('DashboardNavigationIcon', () => {
  it('renders a stable placeholder, then swaps to the async icon registry', async () => {
    const { container } = render(
      <DashboardNavigationIcon className="h-5 w-5" name="Archive" />
    );

    const placeholder = container.querySelector('span[aria-hidden]');
    expect(placeholder?.className).toContain('inline-block');
    expect(placeholder?.className).toContain('h-5');
    expect(placeholder?.className).toContain('w-5');

    await waitFor(() => {
      const svg = container.querySelector('svg');

      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('class')).toContain('h-5');
      expect(svg?.getAttribute('class')).toContain('w-5');
    });
  });
});
