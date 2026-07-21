'use client';

import {
  Boxes,
  Building2,
  CalendarClock,
  ClipboardList,
  FileText,
  Folder,
  Mail,
  MessageSquare,
  Package,
  QrCode,
  Store,
  Zap,
} from '@tuturuuu/icons/lucide';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { RevealGroup, RevealItem } from '../shared/reveal';
import { type SurfaceAccent, SurfaceCard } from '../shared/surface-card';

/**
 * The rest of the suite.
 *
 * The bento above gives six apps a full card each; the remaining twelve get a
 * compact tile, so the page shows the whole platform without eighteen identical
 * boxes. Copy is reused from the navigation bundle rather than duplicated.
 *
 * Every tile leads to a marketing `/products/*` page, never straight into an
 * app: the page is where the link into the running product lives.
 */
const moreApps: Array<{
  key: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  accent: SurfaceAccent;
}> = [
  { key: 'workflows', href: '/products/workflows', icon: Zap, accent: 'cyan' },
  {
    key: 'documents',
    href: '/products/documents',
    icon: FileText,
    accent: 'orange',
  },
  { key: 'drive', href: '/products/drive', icon: Folder, accent: 'yellow' },
  { key: 'mail', href: '/products/mail', icon: Mail, accent: 'red' },
  { key: 'crm', href: '/products/crm', icon: Building2, accent: 'blue' },
  {
    key: 'inventory',
    href: '/products/inventory',
    icon: Package,
    accent: 'green',
  },
  {
    key: 'track',
    href: '/products/track',
    icon: CalendarClock,
    accent: 'orange',
  },
  {
    key: 'forms',
    href: '/products/forms',
    icon: ClipboardList,
    accent: 'purple',
  },
  {
    key: 'chat',
    href: '/products/chat',
    icon: MessageSquare,
    accent: 'cyan',
  },
  {
    key: 'storefront',
    href: '/products/storefront',
    icon: Store,
    accent: 'green',
  },
  { key: 'hive', href: '/products/hive', icon: Boxes, accent: 'purple' },
  { key: 'qr', href: '/products/qr', icon: QrCode, accent: 'blue' },
];

export function MoreApps() {
  const t = useTranslations('landing.features.more');
  const tProducts = useTranslations('marketing-nav.products');

  return (
    <div className="mt-3">
      <div className="mb-6 flex items-center gap-3 px-1">
        <span className="font-mono-ui text-[0.62rem] text-foreground/35 uppercase tracking-[0.2em]">
          {t('title')}
        </span>
        <span
          aria-hidden
          className="h-px flex-1 bg-gradient-to-r from-foreground/12 to-transparent"
        />
      </div>

      <RevealGroup
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        stagger={0.04}
      >
        {moreApps.map((app) => (
          <RevealItem className="h-full" key={app.key}>
            <SurfaceCard
              accent={app.accent}
              description={tProducts(`${app.key}.description` as never)}
              href={app.href}
              icon={app.icon}
              layout="inline"
              title={tProducts(`${app.key}.label` as never)}
            />
          </RevealItem>
        ))}
      </RevealGroup>

      <p className="mt-8 text-balance text-center text-foreground/40 text-sm">
        {t('subtitle')}
      </p>
    </div>
  );
}
