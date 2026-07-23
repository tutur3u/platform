import { Calendar, FileText, type LucideIcon } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';

/**
 * Hall-of-fame surfaces, rebuilt on the marketing card language.
 *
 * These used the generic Card/Badge clones the security subpages carried; they
 * now match the rest of the site. The accent maps stay authored literals so
 * Tailwind can see every class.
 */

export type Researcher = {
  accent: 'green' | 'orange';
  cwe: string;
  date: string;
  icon: LucideIcon;
  impact: string;
  name: string;
  note: string;
  report: string;
  status: string;
};

export type ProgramStep = {
  description: string;
  icon: LucideIcon;
  title: string;
};

const researcherAccents = {
  green: {
    crest:
      'bg-gradient-to-r from-dynamic-green via-dynamic-cyan to-dynamic-blue',
    plate: 'border-dynamic-green/25 bg-dynamic-green/10 text-dynamic-green',
    chip: 'border-dynamic-green/25 bg-dynamic-green/10 text-dynamic-green',
    bloom: 'bg-dynamic-green/20',
  },
  orange: {
    crest:
      'bg-gradient-to-r from-dynamic-orange via-dynamic-yellow to-dynamic-green',
    plate: 'border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange',
    chip: 'border-dynamic-orange/25 bg-dynamic-orange/10 text-dynamic-orange',
    bloom: 'bg-dynamic-orange/20',
  },
} as const;

/** One figure in the ledger strip above the hall. */
export function LedgerMetric({
  className,
  label,
  value,
}: {
  className?: string;
  label: string;
  value: string;
}) {
  return (
    <div className={cn('min-w-0 px-5 py-6 text-center', className)}>
      <div className="break-words font-display font-semibold text-dynamic-blue text-xl tabular-nums tracking-[-0.03em] sm:text-2xl">
        {value}
      </div>
      <div className="mt-2 font-mono-ui text-[0.62rem] text-foreground/40 uppercase leading-snug tracking-[0.14em]">
        {label}
      </div>
    </div>
  );
}

export function ResearcherCard({ researcher }: { researcher: Researcher }) {
  const Icon = researcher.icon;
  const accent = researcherAccents[researcher.accent];

  return (
    <article className="group relative h-full overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] transition-all duration-500 hover:-translate-y-1 hover:border-foreground/15 hover:shadow-2xl hover:shadow-foreground/5">
      {/* Crest: the ribbon across the top of a citation */}
      <span aria-hidden className={cn('block h-1', accent.crest)} />
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -top-20 -right-12 h-48 w-48 rounded-full opacity-0 blur-3xl transition-opacity duration-700 group-hover:opacity-100',
          accent.bloom
        )}
      />

      <div className="relative p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <span
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-transform duration-500 group-hover:scale-105',
              accent.plate
            )}
          >
            <Icon className="h-4 w-4" />
          </span>

          <span
            className={cn(
              'shrink-0 rounded-full border px-2.5 py-0.5 font-mono-ui text-[0.58rem] uppercase tracking-[0.14em]',
              accent.chip
            )}
          >
            {researcher.status}
          </span>
        </div>

        <h3 className="mt-5 font-display font-semibold text-2xl tracking-[-0.02em]">
          {researcher.name}
        </h3>
        <p className="mt-2 text-foreground/60">{researcher.report}</p>

        <div className="mt-5 flex flex-wrap gap-2">
          <FindingFact icon={Calendar} value={researcher.date} />
          <FindingFact icon={FileText} value={researcher.cwe} />
        </div>

        <p className="mt-5 text-foreground/60 text-sm leading-relaxed">
          {researcher.impact}
        </p>
        <p className="mt-4 border-foreground/[0.07] border-t pt-4 text-foreground/45 text-sm leading-relaxed">
          {researcher.note}
        </p>
      </div>
    </article>
  );
}

function FindingFact({
  icon: Icon,
  value,
}: {
  icon: LucideIcon;
  value: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 rounded-full border border-foreground/[0.08] bg-background/50 px-2.5 py-1 font-mono-ui text-[0.6rem] text-foreground/50">
      <Icon className="h-3 w-3 shrink-0 text-foreground/35" />
      <span className="min-w-0 break-words">{value}</span>
    </span>
  );
}

export function ProgramStepCard({ step }: { step: ProgramStep }) {
  const Icon = step.icon;

  return (
    <div className="group relative h-full overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015] p-5 transition-all duration-500 hover:-translate-y-1 hover:border-foreground/15">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-cyan/40 to-transparent opacity-40 transition-opacity duration-500 group-hover:opacity-100"
      />
      <Icon className="relative h-4 w-4 text-dynamic-cyan transition-transform duration-500 group-hover:scale-110" />
      <h3 className="relative mt-4 font-display font-semibold tracking-[-0.01em]">
        {step.title}
      </h3>
      <p className="relative mt-2 text-foreground/50 text-sm leading-relaxed">
        {step.description}
      </p>
    </div>
  );
}
