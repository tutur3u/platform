import { ListChecks } from '@tuturuuu/icons/lucide';
import { AnimateInView } from './animate-in-view';
import type { SummaryRow } from './legal-types';

interface LegalSummaryCardProps {
  title: string;
  description: string;
  rows: SummaryRow[];
  topicColumnLabel?: string;
  summaryColumnLabel?: string;
}

/**
 * The plain-language digest that sits above the full document.
 *
 * Rendered as a definition list rather than a table: it stacks properly on a
 * phone, where a two-column table forced the summary text into a column a few
 * words wide.
 */
export function LegalSummaryCard({
  title,
  description,
  rows,
  topicColumnLabel = 'Topic',
  summaryColumnLabel = 'Summary',
}: LegalSummaryCardProps) {
  return (
    <AnimateInView>
      <section className="relative overflow-hidden rounded-2xl border border-dynamic-purple/20 bg-dynamic-purple/[0.035]">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-purple/50 to-transparent"
        />

        <header className="px-6 pt-6 sm:px-8 sm:pt-8">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-dynamic-purple/25 bg-dynamic-purple/10">
              <ListChecks className="h-4 w-4 text-dynamic-purple" />
            </span>
            <h2 className="font-display font-semibold text-xl tracking-[-0.02em]">
              {title}
            </h2>
          </div>
          <p className="mt-3 max-w-2xl text-foreground/55 text-sm leading-relaxed">
            {description}
          </p>
        </header>

        {/* Column labels live outside the list so the `dl` stays valid. */}
        <div
          aria-hidden
          className="mt-6 hidden border-foreground/[0.07] border-t bg-background/80 sm:grid sm:grid-cols-[13rem_minmax(0,1fr)]"
        >
          <span className="px-8 py-2.5 font-mono-ui text-[0.58rem] text-foreground/35 uppercase tracking-[0.16em]">
            {topicColumnLabel}
          </span>
          <span className="px-6 py-2.5 font-mono-ui text-[0.58rem] text-foreground/35 uppercase tracking-[0.16em]">
            {summaryColumnLabel}
          </span>
        </div>

        <dl className="grid grid-cols-[minmax(0,1fr)] gap-px border-foreground/[0.07] border-t bg-foreground/[0.06] sm:grid-cols-[13rem_minmax(0,1fr)] sm:border-t-0">
          {rows.map((row) => (
            <div
              className="contents"
              key={typeof row.topic === 'string' ? row.topic : ''}
            >
              <dt className="bg-background/60 px-6 pt-4 font-medium text-sm sm:px-8 sm:py-4">
                {row.topic}
              </dt>
              <dd className="bg-background/60 px-6 pt-1.5 pb-4 text-foreground/60 text-sm leading-relaxed sm:px-6 sm:py-4">
                {row.summary}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </AnimateInView>
  );
}
