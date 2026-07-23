'use client';

import {
  Boxes,
  ClipboardList,
  Mail,
  QrCode,
  Sparkles,
  Store,
} from '@tuturuuu/icons/lucide';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { RevealGroup, RevealItem } from '../shared/reveal';
import { type SurfaceAccent, SurfaceCard } from '../shared/surface-card';

/**
 * The rest of the suite.
 *
 * Twelve apps get a full bento card above; the remaining six get a compact
 * tile, so the page shows all eighteen without eighteen identical boxes. Copy
 * is reused from the navigation bundle rather than duplicated, and six tiles on
 * a three-column grid fill exactly two rows.
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
  { key: 'ai', href: '/products/ai', icon: Sparkles, accent: 'purple' },
  { key: 'mail', href: '/products/mail', icon: Mail, accent: 'red' },
  {
    key: 'forms',
    href: '/products/forms',
    icon: ClipboardList,
    accent: 'blue',
  },
  {
    key: 'storefront',
    href: '/products/storefront',
    icon: Store,
    accent: 'green',
  },
  { key: 'hive', href: '/products/hive', icon: Boxes, accent: 'pink' },
  { key: 'qr', href: '/products/qr', icon: QrCode, accent: 'cyan' },
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
        stagger={0.05}
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
