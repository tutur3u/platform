import {
  Calendar,
  FileText,
  type LucideIcon,
  ShieldCheck,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';

export type Researcher = {
  accent: 'green' | 'orange';
  cwe: string;
  date: string;
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
    <div className="border-dynamic-blue/20 border-l-2 pl-4">
      <div className="font-semibold text-xl">{value}</div>
      <div className="mt-1 text-foreground/60 text-sm">{label}</div>
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
    <Card className={cn('h-full p-6 sm:p-8', accentClass)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-background/80">
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

      <div className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
        <Pill icon={Calendar} label={researcher.date} />
        <Pill icon={ShieldCheck} label={researcher.severity} />
        <Pill icon={FileText} label={researcher.cwe} />
      </div>

      <div className="mt-6 space-y-5">
        <ReportBlock
          title={researcher.descriptionLabel}
          value={researcher.description}
        />
        <ReportBlock title={researcher.impactLabel} value={researcher.impact} />
        <ReportBlock
          title={researcher.remediationLabel}
          value={researcher.remediation}
        />
      </div>
    </Card>
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

function Pill({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-background/70 px-3 py-2 text-foreground/70">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">{label}</span>
    </div>
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
