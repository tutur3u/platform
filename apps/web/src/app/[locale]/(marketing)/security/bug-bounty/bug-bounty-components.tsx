import { Calendar, FileText, type LucideIcon } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';

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
  red: 'border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red',
  yellow: 'border-dynamic-yellow/30 bg-dynamic-yellow/10 text-dynamic-yellow',
} as const;

const hallOfFameAccentClasses = {
  green:
    'border-dynamic-green/30 bg-linear-to-br from-dynamic-green/10 via-background to-dynamic-cyan/10',
  orange:
    'border-dynamic-orange/30 bg-linear-to-br from-dynamic-orange/10 via-background to-dynamic-yellow/10',
} as const;

export function LedgerMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-dynamic-blue/20 bg-background/70 p-4">
      <div className="font-semibold text-2xl">{value}</div>
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
    <Card className={cn('h-full overflow-hidden p-0', accentClass)}>
      <div
        className={cn(
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
          <Badge
            variant="secondary"
            className={
              researcher.accent === 'green'
                ? badgeAccentClasses.green
                : badgeAccentClasses.orange
            }
          >
            {researcher.status}
          </Badge>
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
    </Card>
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
    <Card className="border-dynamic-cyan/20 bg-background/80 p-5 shadow-sm">
      <Icon className="mb-4 h-6 w-6 text-dynamic-cyan" />
      <h3 className="font-semibold">{step.title}</h3>
      <p className="mt-2 text-foreground/65 text-sm leading-relaxed">
        {step.description}
      </p>
    </Card>
  );
}
