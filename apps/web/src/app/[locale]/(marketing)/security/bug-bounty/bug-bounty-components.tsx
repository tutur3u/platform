import {
  Calendar,
  FileText,
  Globe2,
  type LucideIcon,
  ShieldCheck,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';

export type Researcher = {
  accent: 'green' | 'orange';
  cwe: string;
  cweLabel: string;
  date: string;
  dateLabel: string;
  description: string;
  descriptionLabel: string;
  icon: LucideIcon;
  impact: string;
  impactLabel: string;
  name: string;
  remediation: string;
  remediationLabel: string;
  report: string;
  severity: string;
  severityLabel: string;
  scope: string;
  scopeLabel: string;
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
  detail,
  label,
  value,
}: {
  detail?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="border-dynamic-blue/20 border-l-2 pl-4">
      <div className="font-semibold text-xl">{value}</div>
      <div className="mt-1 text-foreground/60 text-sm">{label}</div>
      {detail ? (
        <div className="mt-2 text-foreground/50 text-xs leading-relaxed">
          {detail}
        </div>
      ) : null}
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

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <FindingFact
            icon={Calendar}
            label={researcher.dateLabel}
            value={researcher.date}
          />
          <FindingFact
            icon={ShieldCheck}
            label={researcher.severityLabel}
            value={researcher.severity}
          />
          <FindingFact
            icon={Globe2}
            label={researcher.scopeLabel}
            value={researcher.scope}
          />
          <FindingFact
            icon={FileText}
            label={researcher.cweLabel}
            value={researcher.cwe}
          />
        </div>

        <div className="mt-6 space-y-5">
          <ReportBlock
            title={researcher.descriptionLabel}
            value={researcher.description}
          />
          <ReportBlock
            title={researcher.impactLabel}
            value={researcher.impact}
          />
          <ReportBlock
            title={researcher.remediationLabel}
            value={researcher.remediation}
          />
        </div>
      </div>
    </Card>
  );
}

function FindingFact({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/80 bg-background/70 p-3">
      <div className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {label}
      </div>
      <div className="mt-2 flex items-start gap-2 text-foreground/75 text-sm leading-relaxed">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 break-words">{value}</span>
      </div>
    </div>
  );
}

export function DisclosureNote({ item }: { item: ProgramStep }) {
  const Icon = item.icon;

  return (
    <div className="flex gap-4 rounded-lg border border-border/80 bg-background/75 p-4">
      <Icon className="mt-1 h-5 w-5 shrink-0 text-dynamic-purple" />
      <div>
        <h3 className="font-semibold">{item.title}</h3>
        <p className="mt-1 text-foreground/65 text-sm leading-relaxed">
          {item.description}
        </p>
      </div>
    </div>
  );
}

export function ProgramStepCard({ step }: { step: ProgramStep }) {
  const Icon = step.icon;

  return (
    <Card className="border-dynamic-cyan/20 bg-background/80 p-5">
      <Icon className="mb-4 h-6 w-6 text-dynamic-cyan" />
      <h3 className="font-semibold">{step.title}</h3>
      <p className="mt-2 text-foreground/65 text-sm leading-relaxed">
        {step.description}
      </p>
    </Card>
  );
}

function ReportBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="border-border/80 border-t pt-4">
      <p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
        {title}
      </p>
      <p className="mt-2 text-foreground/70 text-sm leading-relaxed">{value}</p>
    </div>
  );
}
