'use client';

import type { ComponentType } from 'react';
import { useEffect, useState } from 'react';

type IconComponent = ComponentType<{ className?: string }>;

const NAVIGATION_ICON_NAMES = [
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
] as const;

export type DashboardNavigationIconName =
  | (typeof NAVIGATION_ICON_NAMES)[number]
  | 'Hexagons3';

type NavigationIconRegistry = Record<
  DashboardNavigationIconName,
  IconComponent
>;

let navigationIconRegistry: NavigationIconRegistry | null = null;
let navigationIconRegistryPromise: Promise<NavigationIconRegistry> | null =
  null;

function loadNavigationIconRegistry() {
  if (!navigationIconRegistryPromise) {
    navigationIconRegistryPromise = Promise.all([
      import('@tuturuuu/icons/lucide'),
      import('@tuturuuu/icons/lab'),
    ]).then(([lucideModule, labModule]) => {
      const lucideIcons = lucideModule as unknown as Record<
        string,
        IconComponent
      > & {
        Icon: ComponentType<{ className?: string; iconNode: unknown }>;
      };
      const labIcons = labModule as { hexagons3: unknown };
      const registry = Object.fromEntries(
        NAVIGATION_ICON_NAMES.map((name) => [name, lucideIcons[name]])
      ) as NavigationIconRegistry;

      registry.Hexagons3 = function Hexagons3NavigationIcon({ className }) {
        return (
          <lucideIcons.Icon
            iconNode={labIcons.hexagons3}
            className={className}
          />
        );
      };

      navigationIconRegistry = registry;
      return registry;
    });
  }

  return navigationIconRegistryPromise;
}

function useNavigationIconRegistry() {
  const [icons, setIcons] = useState(navigationIconRegistry);

  useEffect(() => {
    let active = true;

    void loadNavigationIconRegistry().then((registry) => {
      if (active) setIcons(registry);
    });

    return () => {
      active = false;
    };
  }, []);

  return icons;
}

export function DashboardNavigationIcon({
  className,
  name,
}: {
  className?: string;
  name: DashboardNavigationIconName;
}) {
  const icons = useNavigationIconRegistry();
  const IconComponent = icons?.[name];

  if (!IconComponent) {
    return (
      <span
        aria-hidden
        className={`inline-block shrink-0 rounded-sm bg-foreground/10 ${className ?? ''}`}
      />
    );
  }

  return <IconComponent className={className} />;
}
