import { ArrowRight, type LucideIcon } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';

export function TeachOperationCard({
  accentClassName = 'bg-dynamic-yellow/15',
  count,
  href,
  icon: Icon,
  label,
  text,
}: {
  accentClassName?: string;
  count: number;
  href: string;
  icon: LucideIcon;
  label: string;
  text: string;
}) {
  return (
    <a
      className="group grid min-h-44 gap-4 rounded-lg border border-border bg-card p-4 transition duration-200 hover:bg-muted/30"
      href={href}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'flex h-11 w-11 items-center justify-center border border-border',
            accentClassName
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="rounded-lg border border-border bg-background px-3 py-1 font-semibold text-xl tabular-nums">
          {count}
        </span>
      </div>
      <div>
        <h3 className="font-semibold text-xl">{label}</h3>
        <p className="mt-2 text-muted-foreground text-sm leading-6">{text}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" />
    </a>
  );
}
