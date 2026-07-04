import { CheckCircle2, type LucideIcon } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';
import {
  SecuritySubpageBadge as Badge,
  SecuritySubpageCard as Card,
} from '../security-subpage-primitives';

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
      <Badge
        variant="secondary"
        className="mb-4 border-dynamic-cyan/30 bg-dynamic-cyan/10 text-dynamic-cyan"
      >
        <Icon className="mr-1.5 h-3.5 w-3.5" />
        {badge}
      </Badge>
      <h2 className="font-semibold text-3xl sm:text-4xl">{title}</h2>
      <p className="mt-3 text-foreground/65 leading-relaxed">{description}</p>
    </div>
  );
}

export function PolicyInfoCard({ card }: { card: PolicyCard }) {
  const Icon = card.icon;

  return (
    <Card className={cn('h-full p-6 shadow-sm', card.className)}>
      <div
        className={cn(
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
    </Card>
  );
}

export function PolicyListPanel({ panel }: { panel: ListPanel }) {
  const Icon = panel.icon;

  return (
    <Card className={cn('h-full p-6 sm:p-8', panel.className)}>
      <div className="mb-5 flex items-center gap-3">
        <Icon className={cn('h-6 w-6', panel.iconClassName)} />
        <h3 className="font-semibold text-2xl">{panel.title}</h3>
      </div>
      <div className="grid gap-3">
        {panel.items.map((item) => (
          <PolicyChecklistItem key={item}>{item}</PolicyChecklistItem>
        ))}
      </div>
    </Card>
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
