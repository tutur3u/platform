import { CornerDownRight } from '@tuturuuu/icons';
import { SectionShell } from '@tuturuuu/ui/marketing';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { FeatureGrid } from '../feature-grid';
import { LANDING_LOGIC_FEATURES } from '../landing-config';

/** The three branches drawn in the diagram, keyed to `rules.<key>`. */
const RULE_KEYS = ['enterprise', 'startup', 'individual'] as const;

/**
 * Branching diagram.
 *
 * A literal rendering of one rule set — question, condition, destination —
 * rather than an abstract flowchart, so the mechanic is legible without a
 * legend. Static markup, not a screenshot, so it restyles with the theme and
 * translates with the page.
 */
function BranchingDiagram() {
  const t = useTranslations('forms.landing.logic.diagram');

  return (
    <div className="relative overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-6 sm:p-8">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--purple)_45%,transparent),transparent)]"
      />

      <p className="font-mono-ui text-[0.65rem] text-foreground/40 uppercase tracking-[0.18em]">
        {t('source_label')}
      </p>
      <p className="mt-2 font-display font-semibold text-lg tracking-[-0.01em]">
        {t('source_question')}
      </p>

      <ul className="mt-6 space-y-2.5">
        {RULE_KEYS.map((key) => (
          <li
            className="flex flex-col gap-2 rounded-xl border border-foreground/[0.07] bg-background/50 p-3 sm:flex-row sm:items-center sm:gap-3"
            key={key}
          >
            <span className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-foreground/[0.04] px-2.5 py-1 font-mono-ui text-[0.65rem] text-foreground/50 uppercase tracking-[0.14em]">
              {t('if')}
            </span>
            <span className="min-w-0 flex-1 truncate text-foreground/75 text-sm">
              {t(`rules.${key}.answer`)}
            </span>
            <CornerDownRight
              aria-hidden
              className="hidden h-3.5 w-3.5 shrink-0 text-foreground/25 sm:block"
            />
            <span
              className={cn(
                'inline-flex shrink-0 items-center rounded-lg border border-dynamic-purple/25 bg-dynamic-purple/10 px-2.5 py-1 text-dynamic-purple text-xs'
              )}
            >
              {t(`rules.${key}.destination`)}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-foreground/40 text-xs leading-relaxed">
        {t('note')}
      </p>
    </div>
  );
}

/** Logic, validation and scheduling. */
export function LogicSection() {
  const t = useTranslations('forms.landing.logic');

  return (
    <SectionShell
      align="start"
      bloom="indigo"
      eyebrow={t('eyebrow')}
      id="logic"
      index="03"
      subtitle={t('subtitle')}
      title={t('title')}
      width="wide"
    >
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr] lg:gap-6">
        <BranchingDiagram />
        <FeatureGrid
          columns={2}
          items={LANDING_LOGIC_FEATURES}
          namespace="forms.landing.logic.features"
        />
      </div>
    </SectionShell>
  );
}
