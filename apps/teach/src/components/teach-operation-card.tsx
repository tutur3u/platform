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
      className="group grid min-h-44 gap-4 border-2 border-border bg-card p-4 shadow-[5px_5px_0_var(--border)] transition duration-200 hover:-translate-y-0.5 hover:border-foreground/70 hover:shadow-[7px_7px_0_var(--foreground)]"
      href={href}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            'flex h-11 w-11 items-center justify-center border-2 border-border shadow-[3px_3px_0_var(--border)]',
            accentClassName
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="border-2 border-border bg-background px-3 py-1 font-black text-xl tabular-nums shadow-[2px_2px_0_var(--border)]">
          {count}
        </span>
      </div>
      <div>
        <h3 className="font-black text-xl">{label}</h3>
        <p className="mt-2 text-muted-foreground text-sm leading-6">{text}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-foreground" />
    </a>
  );
}
