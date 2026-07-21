import {
  Calendar,
  CheckCircle2,
  GraduationCap,
  MessageSquare,
  Users,
  Wallet,
} from '@tuturuuu/icons/lucide';
import { useTranslations } from 'next-intl';
import { RevealGroup, RevealItem } from '../shared/reveal';
import { SectionShell } from '../shared/section-shell';
import { FeatureCard, type FeatureColor } from './feature-card';
import { productPreviews } from './product-previews';
import { SpotlightGrid } from './spotlight-grid';

const products: Array<{
  icon: typeof Calendar;
  appKey: keyof typeof productPreviews;
  color: FeatureColor;
  /** Bento placement on the 4-column large-screen grid. */
  span: string;
  wide?: boolean;
}> = [
  {
    icon: Calendar,
    appKey: 'tuplan',
    color: 'blue',
    span: 'sm:col-span-2',
    wide: true,
  },
  { icon: CheckCircle2, appKey: 'tudo', color: 'green', span: 'sm:col-span-1' },
  { icon: Users, appKey: 'tumeet', color: 'purple', span: 'sm:col-span-1' },
  {
    icon: MessageSquare,
    appKey: 'tuchat',
    color: 'cyan',
    span: 'sm:col-span-1',
  },
  { icon: Wallet, appKey: 'tufinance', color: 'pink', span: 'sm:col-span-1' },
  {
    icon: GraduationCap,
    appKey: 'nova',
    color: 'orange',
    span: 'sm:col-span-2',
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
      index="02"
      subtitle={t('subtitle')}
      title={t('title')}
    >
      <SpotlightGrid>
        <RevealGroup
          className="grid auto-rows-fr gap-3 sm:grid-cols-2 lg:grid-cols-4"
          stagger={0.07}
        >
          {products.map((product) => {
            const Preview = productPreviews[product.appKey];

            return (
              <RevealItem
                className={`h-full ${product.span}`}
                key={product.appKey}
              >
                <FeatureCard
                  color={product.color}
                  description={t(`apps.${product.appKey}.description` as never)}
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
    </SectionShell>
  );
}
