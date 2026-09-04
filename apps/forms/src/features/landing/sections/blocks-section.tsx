import { SectionShell } from '@tuturuuu/ui/marketing';
import { useTranslations } from 'next-intl';
import { FeatureGrid } from '../feature-grid';
import { LANDING_BLOCKS } from '../landing-config';

/** Question and content block gallery. */
export function BlocksSection() {
  const t = useTranslations('forms.landing.build');

  return (
    <SectionShell
      bloom="blue"
      eyebrow={t('eyebrow')}
      id="build"
      index="02"
      subtitle={t('subtitle')}
      title={t('title')}
      width="wide"
    >
      <FeatureGrid
        columns={5}
        items={LANDING_BLOCKS}
        layout="inline"
        namespace="forms.landing.build.blocks"
      />
      <p className="mt-8 text-center text-foreground/40 text-sm">
        {t('footnote')}
      </p>
    </SectionShell>
  );
}
