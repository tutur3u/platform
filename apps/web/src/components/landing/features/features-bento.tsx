import {
  Calendar,
  CheckCircle2,
  GraduationCap,
  MessageSquare,
  Users,
  Wallet,
} from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { FeatureCard } from './feature-card';

const products: Array<{
  icon: typeof Calendar;
  appKey: string;
  color: 'blue' | 'green' | 'purple' | 'cyan' | 'orange';
}> = [
  { icon: Calendar, appKey: 'tuplan', color: 'blue' },
  { icon: CheckCircle2, appKey: 'tudo', color: 'green' },
  { icon: Users, appKey: 'tumeet', color: 'purple' },
  { icon: MessageSquare, appKey: 'tuchat', color: 'cyan' },
  { icon: Wallet, appKey: 'tufinance', color: 'green' },
  { icon: GraduationCap, appKey: 'nova', color: 'orange' },
];

export function FeaturesBento() {
  const t = useTranslations('landing.features');

  return (
    <section
      id="features"
      className="relative scroll-mt-20 px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center sm:mb-16">
          <h2 className="mb-4 font-bold text-3xl tracking-tight sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mx-auto max-w-xl text-foreground/60 text-lg">
            {t('subtitle')}
          </p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <FeatureCard
              key={product.appKey}
              icon={product.icon}
              title={t(`apps.${product.appKey}.title` as any)}
              subtitle={t(`apps.${product.appKey}.subtitle` as any)}
              description={t(`apps.${product.appKey}.description` as any)}
              color={product.color}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
