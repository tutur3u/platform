import type { LucideIcon } from '@tuturuuu/icons/lucide';
import { Calendar, CheckCircle2, FileText } from '@tuturuuu/icons/lucide';
import {
  joinClassNames,
  SecurityBadge,
  SecurityCard,
} from './security-page-primitives';

export type PolicyCard = {
  className: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
  title: string;
};

export type ListPanel = {
  className: string;
  icon: LucideIcon;
  iconClassName: string;
  items: string[];
  title: string;
};

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

export const badgeAccentClasses = {
  blue: 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue',
  green: 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green',
  orange: 'border-dynamic-orange/30 bg-dynamic-orange/10 text-dynamic-orange',
  purple: 'border-dynamic-purple/30 bg-dynamic-purple/10 text-dynamic-purple',
  yellow: 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow',
} as const;

const hallOfFameAccentClasses = {
  green:
    'border-dynamic-green/30 bg-linear-to-br from-dynamic-green/10 via-background to-dynamic-cyan/10',
  orange:
    'border-dynamic-orange/30 bg-linear-to-br from-dynamic-orange/10 via-background to-dynamic-yellow/10',
} as const;

export function PolicyMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-dynamic-cyan/20 bg-background/70 p-4">
      <div className="break-words font-semibold text-xl">{value}</div>
      <div className="mt-1 text-foreground/60 text-sm leading-snug">
        {label}
      </div>
    </div>
  );
}

export function SectionHeader({
  badge,
  description,
  icon: Icon,
  title,
}: {
  badge: string;
  description: string;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="mb-8 max-w-3xl">
      <SecurityBadge className="mb-4 border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan">
        <Icon className="mr-1.5 h-3.5 w-3.5" />
        {badge}
      </SecurityBadge>
      <h2 className="font-semibold text-3xl sm:text-4xl">{title}</h2>
      <p className="mt-3 text-foreground/65 leading-relaxed">{description}</p>
    </div>
  );
}

export function PolicyInfoCard({ card }: { card: PolicyCard }) {
  const Icon = card.icon;

  return (
    <SecurityCard
      className={joinClassNames('h-full p-6 shadow-sm', card.className)}
    >
      <div
        className={joinClassNames(
          'mb-5 flex h-12 w-12 items-center justify-center rounded-lg',
          card.iconClassName
        )}
      >
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="font-semibold text-xl">{card.title}</h3>
      <p className="mt-3 text-foreground/65 text-sm leading-relaxed">
        {card.description}
      </p>
    </SecurityCard>
  );
}

export function PolicyListPanel({ panel }: { panel: ListPanel }) {
  const Icon = panel.icon;

  return (
    <SecurityCard
      className={joinClassNames('h-full p-6 sm:p-8', panel.className)}
    >
      <div className="mb-5 flex items-center gap-3">
        <Icon className={joinClassNames('h-6 w-6', panel.iconClassName)} />
        <h3 className="font-semibold text-2xl">{panel.title}</h3>
      </div>
      <div className="grid gap-3">
        {panel.items.map((item) => (
          <PolicyChecklistItem key={item}>{item}</PolicyChecklistItem>
        ))}
      </div>
    </SecurityCard>
  );
}

export function PolicyChecklistItem({ children }: { children: string }) {
  return (
    <div className="flex gap-3 rounded-lg border border-border/70 bg-background/70 p-3 text-foreground/70 text-sm leading-relaxed">
      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-dynamic-green" />
      <span>{children}</span>
    </div>
  );
}

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
    <div
      className={joinClassNames(
        'min-w-0 rounded-lg border border-dynamic-blue/20 bg-background/70 p-4',
        className
      )}
    >
      <div className="break-words font-semibold text-xl sm:text-2xl">
        {value}
      </div>
      <div className="mt-1 text-foreground/60 text-sm leading-snug">
        {label}
      </div>
    </div>
  );
}

export function ResearcherCard({ researcher }: { researcher: Researcher }) {
  const Icon = researcher.icon;
  const accentClass =
    researcher.accent === 'green'
      ? hallOfFameAccentClasses.green
      : hallOfFameAccentClasses.orange;

  return (
    <SecurityCard
      className={joinClassNames('h-full overflow-hidden p-0', accentClass)}
    >
      <div
        className={joinClassNames(
          'h-1.5',
          researcher.accent === 'green'
            ? 'bg-linear-to-r from-dynamic-green via-dynamic-cyan to-dynamic-blue'
            : 'bg-linear-to-r from-dynamic-orange via-dynamic-yellow to-dynamic-green'
        )}
      />
      <div className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-background/80 shadow-sm">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-2xl">{researcher.name}</h3>
            <p className="mt-2 text-foreground/70">{researcher.report}</p>
          </div>
          <SecurityBadge
            className={
              researcher.accent === 'green'
                ? badgeAccentClasses.green
                : badgeAccentClasses.orange
            }
          >
            {researcher.status}
          </SecurityBadge>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          <FindingFact icon={Calendar} value={researcher.date} />
          <FindingFact icon={FileText} value={researcher.cwe} />
        </div>

        <div className="mt-6 space-y-4">
          <p className="text-foreground/75 text-sm leading-relaxed">
            {researcher.impact}
          </p>
          <p className="border-border/80 border-t pt-4 text-foreground/55 text-sm leading-relaxed">
            {researcher.note}
          </p>
        </div>
      </div>
    </SecurityCard>
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
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border/80 bg-background/70 px-3 py-2 text-foreground/70">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 break-words">{value}</span>
    </div>
  );
}

export function ProgramStepCard({ step }: { step: ProgramStep }) {
  const Icon = step.icon;

  return (
    <SecurityCard className="border-dynamic-cyan/20 bg-background/80 p-5 shadow-sm">
      <Icon className="mb-4 h-6 w-6 text-dynamic-cyan" />
      <h3 className="font-semibold">{step.title}</h3>
      <p className="mt-2 text-foreground/65 text-sm leading-relaxed">
        {step.description}
      </p>
    </SecurityCard>
  );
}
