import { CheckCircle2, type LucideIcon } from '@tuturuuu/icons/lucide';
import { cn } from '@tuturuuu/utils/format';

/**
 * Policy page surfaces, rebuilt on the landing system's card language.
 *
 * The `className`/`iconClassName` pairs the page already passes are kept as
 * the accent API — they are authored literals, so Tailwind sees them — but the
 * shapes underneath (lit top edge, hairline borders, hover bloom) now match
 * the rest of the marketing site instead of the generic Card/Badge clones the
 * security subpages used to carry.
 */

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
    <div className="min-w-0 px-5 py-6 text-center">
      <div className="break-words font-display font-semibold text-2xl text-dynamic-cyan tabular-nums tracking-[-0.03em] sm:text-3xl">
        {value}
      </div>
      <div className="mt-2 font-mono-ui text-[0.62rem] text-foreground/40 uppercase leading-snug tracking-[0.14em]">
        {label}
      </div>
    </div>
  );
}

/** The metric row, as one divided instrument panel. */
export function PolicyMetrics({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mt-10 overflow-hidden rounded-2xl border border-foreground/[0.08] bg-foreground/[0.015]">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-dynamic-cyan/40 to-transparent"
      />
      <div className="grid divide-y divide-foreground/[0.07] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {children}
      </div>
    </div>
  );
}

export function PolicyInfoCard({ card }: { card: PolicyCard }) {
  const Icon = card.icon;

  return (
    <div
      className={cn(
        'group relative h-full overflow-hidden rounded-2xl border p-6 transition-all duration-500 hover:-translate-y-1 hover:shadow-2xl hover:shadow-foreground/5',
        card.className
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
      />

      <span
        className={cn(
          'relative flex h-11 w-11 items-center justify-center rounded-xl border border-foreground/10 transition-transform duration-500 group-hover:scale-105',
          card.iconClassName
        )}
      >
        <Icon className="h-4.5 w-4.5" />
      </span>

      <h3 className="relative mt-5 font-display font-semibold text-xl tracking-[-0.02em]">
        {card.title}
      </h3>
      <p className="relative mt-3 text-foreground/55 text-sm leading-relaxed">
        {card.description}
      </p>
    </div>
  );
}

export function PolicyListPanel({ panel }: { panel: ListPanel }) {
  const Icon = panel.icon;

  return (
    <div
      className={cn(
        'relative h-full overflow-hidden rounded-2xl border p-6 sm:p-7',
        panel.className
      )}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
      />

      <div className="relative mb-5 flex items-center gap-3">
        <Icon className={cn('h-5 w-5', panel.iconClassName)} />
        <h3 className="font-display font-semibold text-xl tracking-[-0.02em]">
          {panel.title}
        </h3>
      </div>

      <ul className="relative grid gap-2">
        {panel.items.map((item) => (
          <PolicyChecklistItem key={item}>{item}</PolicyChecklistItem>
        ))}
      </ul>
    </div>
  );
}

export function PolicyChecklistItem({ children }: { children: string }) {
  return (
    <li className="flex gap-2.5 rounded-xl border border-foreground/[0.07] bg-background/50 px-3.5 py-2.5 text-foreground/60 text-sm leading-relaxed">
      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-dynamic-green/80" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}
