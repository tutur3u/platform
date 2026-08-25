import { getMarketingAccent, SectionShell } from '@tuturuuu/ui/marketing';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { LANDING_WORKFLOW_STEPS } from '../landing-config';

/**
 * The end-to-end path, as a connected rail.
 *
 * Rendered as four numbered stops joined by a hairline so the page states the
 * whole journey — build, design, share, learn — before drilling into any one
 * stage. The connector is drawn per-card rather than as one absolute line so it
 * wraps correctly when the grid collapses to two columns and then one.
 */
export function WorkflowSection() {
  const t = useTranslations('forms.landing.workflow');

  return (
    <SectionShell
      bloom="purple"
      eyebrow={t('eyebrow')}
      id="workflow"
      index="01"
      subtitle={t('subtitle')}
      title={t('title')}
    >
      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {LANDING_WORKFLOW_STEPS.map((step, index) => {
          const tokens = getMarketingAccent(step.accent);
          const Icon = step.icon;
          const isLast = index === LANDING_WORKFLOW_STEPS.length - 1;

          return (
            <li
              className="group relative flex flex-col rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-6 transition-colors duration-500 hover:border-foreground/15"
              key={step.key}
            >
              {/* Connector to the next stop; hidden on the last card and
                  whenever the grid has wrapped to a single column. */}
              {isLast ? null : (
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-11 -right-2 hidden h-px w-4 bg-foreground/15 lg:block"
                />
              )}

              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-xl border border-foreground/10 bg-foreground/[0.03] transition-transform duration-500 group-hover:scale-105',
                    tokens.text
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="font-mono-ui text-[0.7rem] text-foreground/25 tabular-nums">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>

              <h3 className="mt-5 font-display font-semibold text-lg tracking-[-0.01em]">
                {t(`steps.${step.key}.title`)}
              </h3>
              <p className="mt-2 text-foreground/50 text-sm leading-relaxed">
                {t(`steps.${step.key}.description`)}
              </p>
            </li>
          );
        })}
      </ol>
    </SectionShell>
  );
}
