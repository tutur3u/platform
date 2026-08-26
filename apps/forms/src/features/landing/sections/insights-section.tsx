import { SectionShell } from '@tuturuuu/ui/marketing';
import { useTranslations } from 'next-intl';
import { FeatureGrid } from '../feature-grid';
import { LANDING_INSIGHT_FEATURES } from '../landing-config';

/** Funnel steps, widest first. Percentages are illustrative, not live data. */
const FUNNEL_STEPS = [
  { key: 'views', width: 'w-full', tone: 'bg-dynamic-blue/70' },
  { key: 'starts', width: 'w-[74%]', tone: 'bg-dynamic-cyan/70' },
  { key: 'completed', width: 'w-[52%]', tone: 'bg-dynamic-green/70' },
] as const;

/**
 * Response funnel.
 *
 * Views → starts → completions is the shape the analytics tab actually reports,
 * so showing it here sets the right expectation about what gets measured.
 */
function FunnelPreview() {
  const t = useTranslations('forms.landing.insights.funnel');

  return (
    <div className="rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-6 sm:p-8">
      <p className="font-mono-ui text-[0.65rem] text-foreground/40 uppercase tracking-[0.18em]">
        {t('label')}
      </p>
      <ul className="mt-6 space-y-4">
        {FUNNEL_STEPS.map((step) => (
          <li key={step.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-foreground/65 text-sm">
                {t(`steps.${step.key}.label`)}
              </span>
              <span className="font-display font-semibold text-base tabular-nums">
                {t(`steps.${step.key}.value`)}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
              <div
                className={`h-full rounded-full ${step.width} ${step.tone}`}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-foreground/40 text-xs leading-relaxed">
        {t('note')}
      </p>
    </div>
  );
}

/** Responses, analytics and export. */
export function InsightsSection() {
  const t = useTranslations('forms.landing.insights');

  return (
    <SectionShell
      align="start"
      bloom="cyan"
      eyebrow={t('eyebrow')}
      id="insights"
      index="07"
      subtitle={t('subtitle')}
      title={t('title')}
      width="wide"
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr] lg:gap-6">
        <FunnelPreview />
        <FeatureGrid
          columns={2}
          items={LANDING_INSIGHT_FEATURES}
          namespace="forms.landing.insights.features"
        />
      </div>
    </SectionShell>
  );
}
