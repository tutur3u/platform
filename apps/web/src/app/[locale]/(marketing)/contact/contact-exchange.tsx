import { useTranslations } from 'next-intl';
import { Reveal } from '@/components/landing/shared/reveal';
import { SectionShell } from '@/components/landing/shared/section-shell';
import { ContactAside } from './contact-aside';
import { ContactForm } from './contact-form';

/**
 * The working part of the page: the form, with its supporting column beside it
 * on wide viewports and beneath it on narrow ones.
 */
export function ContactExchange() {
  const t = useTranslations('contact');

  return (
    <SectionShell
      align="start"
      bloom="blue"
      eyebrow={t('form.eyebrow')}
      index="02"
      subtitle={t('form.description')}
      title={t('form.title')}
      width="wide"
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:gap-10">
        <Reveal>
          <ContactForm />
        </Reveal>
        <Reveal delay={0.1} direction="left">
          <ContactAside />
        </Reveal>
      </div>
    </SectionShell>
  );
}
