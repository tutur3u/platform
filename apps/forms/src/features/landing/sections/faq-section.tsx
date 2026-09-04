import { MarketingFaqList, SectionShell } from '@tuturuuu/ui/marketing';
import { useTranslations } from 'next-intl';
import { LANDING_FAQ_IDS } from '../landing-config';

/** Frequently asked questions. */
export function FaqSection() {
  const t = useTranslations('forms.landing.faq');

  return (
    <SectionShell
      bloom="blue"
      eyebrow={t('eyebrow')}
      id="faq"
      index="09"
      subtitle={t('subtitle')}
      title={t('title')}
      width="narrow"
    >
      <MarketingFaqList
        items={LANDING_FAQ_IDS.map((id) => ({
          id,
          answer: t(`items.${id}.answer`),
          question: t(`items.${id}.question`),
        }))}
      />
    </SectionShell>
  );
}
