import {
  Building2,
  Calendar,
  CheckCircle2,
  FileText,
  Folder,
  GraduationCap,
  MessageSquare,
  Package,
  Timer,
  Users,
  Wallet,
  Zap,
} from '@tuturuuu/icons/lucide';
import { useTranslations } from 'next-intl';
import { RevealGroup, RevealItem } from '../shared/reveal';
import { SectionShell } from '../shared/section-shell';
import { FeatureCard, type FeatureColor } from './feature-card';
import { MoreApps } from './more-apps';
import { productPreviews } from './product-previews';
import { SpotlightGrid } from './spotlight-grid';

/**
 * Twelve apps, each with a card and a bespoke preview.
 *
 * The layout is a true bento: on the four-column grid every row is a 2+1+1 or
 * 1+1+2 arrangement, so the columns always tile exactly and the wide card
 * alternates sides down the page. Combined with full-height cards, that leaves
 * no holes at any breakpoint — on the two-column grid the same spans fall into
 * clean full-width / half-half pairs.
 */
const products: Array<{
  icon: typeof Calendar;
  appKey: keyof typeof productPreviews;
  href: string;
  color: FeatureColor;
  wide?: boolean;
}> = [
  // Row 1 — 2 + 1 + 1
  {
    icon: Calendar,
    appKey: 'calendar',
    href: '/products/calendar',
    color: 'blue',
    wide: true,
  },
  {
    icon: CheckCircle2,
    appKey: 'tasks',
    href: '/products/tasks',
    color: 'green',
  },
  {
    icon: Users,
    appKey: 'meet',
    href: '/products/meet-together',
    color: 'purple',
  },

  // Row 2 — 1 + 1 + 2
  {
    icon: MessageSquare,
    appKey: 'chat',
    href: '/products/chat',
    color: 'cyan',
  },
  {
    icon: Wallet,
    appKey: 'finance',
    href: '/products/finance',
    color: 'pink',
  },
  {
    icon: GraduationCap,
    appKey: 'nova',
    href: '/products/lms',
    color: 'orange',
    wide: true,
  },

  // Row 3 — 2 + 1 + 1
  {
    icon: Zap,
    appKey: 'workflows',
    href: '/products/workflows',
    color: 'cyan',
    wide: true,
  },
  {
    icon: FileText,
    appKey: 'documents',
    href: '/products/documents',
    color: 'orange',
  },
  {
    icon: Folder,
    appKey: 'drive',
    href: '/products/drive',
    color: 'yellow',
  },

  // Row 4 — 1 + 1 + 2
  {
    icon: Timer,
    appKey: 'track',
    href: '/products/track',
    color: 'orange',
  },
  {
    icon: Building2,
    appKey: 'crm',
    href: '/products/crm',
    color: 'blue',
  },
  {
    icon: Package,
    appKey: 'inventory',
    href: '/products/inventory',
    color: 'green',
    wide: true,
  },
];

export function FeaturesBento() {
  const t = useTranslations('landing.features');

  return (
    <SectionShell
      bloom="blue"
      eyebrow={t('eyebrow')}
      id="features"
      index="03"
      subtitle={t('subtitle')}
      title={t('title')}
      width="wide"
    >
      <SpotlightGrid>
        <RevealGroup
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          stagger={0.05}
        >
          {products.map((product) => {
            const Preview = productPreviews[product.appKey];

            return (
              <RevealItem
                // `sm:col-span-2` covers both grids: full width at two columns,
                // half a row at four.
                className={product.wide ? 'h-full sm:col-span-2' : 'h-full'}
                key={product.appKey}
              >
                <FeatureCard
                  color={product.color}
                  description={t(`apps.${product.appKey}.description` as never)}
                  href={product.href}
                  icon={product.icon}
                  preview={<Preview />}
                  subtitle={t(`apps.${product.appKey}.subtitle` as never)}
                  title={t(`apps.${product.appKey}.title` as never)}
                  wide={product.wide}
                />
              </RevealItem>
            );
          })}
        </RevealGroup>
      </SpotlightGrid>

      <MoreApps />
    </SectionShell>
  );
}
