import { ClipboardList } from '@tuturuuu/icons';
import {
  HeroAtmosphere,
  MarketingPill,
  MarketingStatBand,
  SecondaryCta,
} from '@tuturuuu/ui/marketing';
import { useTranslations } from 'next-intl';
import { PrimaryCtaSlot } from '../cta-slots';
import type { DemoFormCopy } from '../demo/demo-form';
import { LiveDemo } from '../demo/live-demo';

const STAT_KEYS = ['blocks', 'themes', 'embeds', 'languages'] as const;

interface HeroSectionProps {
  /** In-page anchor for the quiet secondary action. */
  secondaryHref: string;
}

/**
 * Hero: positioning copy, both calls to action, then a full-width frame holding
 * the interactive demo. The demo sits below the copy rather than beside it —
 * side by side, the runtime is squeezed to a column narrower than any real form
 * would ever render at, which undersells it.
 */
export function HeroSection({ secondaryHref }: HeroSectionProps) {
  const t = useTranslations('forms.landing');
  const tHero = useTranslations('forms.landing.hero');
  const tDemo = useTranslations('forms.landing.demo');

  const demoCopy: DemoFormCopy = {
    title: tDemo('title'),
    description: tDemo('description'),
    confirmationTitle: tDemo('confirmation_title'),
    confirmationMessage: tDemo('confirmation_message'),
    sectionTitle: tDemo('section_title'),
    sectionDescription: tDemo('section_description'),
    roleTitle: tDemo('role_title'),
    roleOptions: [
      tDemo('role_option_1'),
      tDemo('role_option_2'),
      tDemo('role_option_3'),
      tDemo('role_option_4'),
    ],
    priorityTitle: tDemo('priority_title'),
    priorityDescription: tDemo('priority_description'),
    priorityOptions: [
      tDemo('priority_option_1'),
      tDemo('priority_option_2'),
      tDemo('priority_option_3'),
      tDemo('priority_option_4'),
    ],
    satisfactionTitle: tDemo('satisfaction_title'),
    satisfactionMinLabel: tDemo('satisfaction_min'),
    satisfactionMaxLabel: tDemo('satisfaction_max'),
    notesTitle: tDemo('notes_title'),
    notesPlaceholder: tDemo('notes_placeholder'),
  };

  return (
    // `isolate` matters: the atmosphere paints at `-z-10`, and without a local
    // stacking context it would slide behind the page wrapper's background and
    // disappear entirely.
    <section className="relative isolate overflow-hidden px-4 pt-28 pb-16 sm:px-6 sm:pt-32 lg:px-8 lg:pt-36">
      <HeroAtmosphere primary="purple" secondary="blue" tertiary="cyan" />

      <div className="mx-auto flex w-full max-w-4xl flex-col items-center text-center">
        <MarketingPill accent="purple" icon={ClipboardList}>
          {tHero('eyebrow')}
        </MarketingPill>

        <h1 className="mt-8 text-balance font-display font-extrabold text-4xl leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
          {tHero('title')}
        </h1>

        <p className="mt-6 max-w-2xl text-balance text-base text-foreground/55 leading-relaxed sm:text-lg">
          {tHero('description')}
        </p>

        <div className="mt-9 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <PrimaryCtaSlot />
          <SecondaryCta href={secondaryHref}>{tHero('secondary')}</SecondaryCta>
        </div>

        <p className="mt-5 text-foreground/40 text-xs">
          {tHero('reassurance')}
        </p>
      </div>

      <div className="relative mx-auto mt-16 w-full max-w-5xl">
        <LiveDemo copy={demoCopy} themeLabel={tDemo('theme_label')} />
      </div>

      <div className="mx-auto mt-14 w-full max-w-4xl">
        <MarketingStatBand
          stats={STAT_KEYS.map((key) => ({
            id: key,
            label: t(`stats.${key}.label`),
            value: t(`stats.${key}.value`),
          }))}
        />
      </div>
    </section>
  );
}
