'use client';

type HiveServerMetricProps = {
  label: string;
  value: number;
};

export function HiveServerMetric({ label, value }: HiveServerMetricProps) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/35 px-2.5 py-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold text-foreground">
        {value.toLocaleString()}
      </p>
    </div>
  );
}
