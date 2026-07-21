'use client';

export function MetricCard({
  label,
  value,
  suffix,
  helper,
}: {
  label: string;
  value: number;
  suffix?: string;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3">
      <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
        {label}
      </p>
      <p className="mt-1 font-semibold text-2xl">
        {value}
        {suffix ?? ''}
      </p>
      {helper ? (
        <p className="mt-1 line-clamp-2 text-muted-foreground text-xs">
          {helper}
        </p>
      ) : null}
    </div>
  );
}
