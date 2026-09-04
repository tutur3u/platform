import { SectionShell } from '@tuturuuu/ui/marketing';
import { useTranslations } from 'next-intl';
import { FeatureGrid } from '../feature-grid';
import {
  LANDING_DEVELOPER_FEATURES,
  LANDING_SECURITY_FEATURES,
} from '../landing-config';

/** Trust, governance and the developer surface. */
export function SecuritySection() {
  const t = useTranslations('forms.landing.trust');

  return (
    <SectionShell
      bloom="green"
      eyebrow={t('eyebrow')}
      id="trust"
      index="08"
      subtitle={t('subtitle')}
      title={t('title')}
      width="wide"
    >
      <FeatureGrid
        columns={4}
        items={LANDING_SECURITY_FEATURES}
        namespace="forms.landing.trust.features"
      />

      <h3 className="mt-14 text-center font-display font-semibold text-2xl tracking-[-0.02em]">
        {t('developer_heading')}
      </h3>
      <p className="mx-auto mt-3 max-w-xl text-balance text-center text-foreground/50 text-sm leading-relaxed">
        {t('developer_description')}
      </p>
      <FeatureGrid
        className="mt-8"
        columns={3}
        items={LANDING_DEVELOPER_FEATURES}
        namespace="forms.landing.trust.developer"
      />
    </SectionShell>
  );
}
