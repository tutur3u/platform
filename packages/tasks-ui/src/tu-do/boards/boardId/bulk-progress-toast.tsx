import { Progress } from '@tuturuuu/ui/progress';

interface Props {
  label: string;
  done: number;
  total: number;
}

/** Toast body for a running bulk task operation: label, x/N and a bar. */
export function BulkProgressToast({ label, done, total }: Props) {
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex w-full min-w-56 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span>{label}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {done}/{total}
        </span>
      </div>
      <Progress
        aria-label={label}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-1"
        value={percent}
      />
    </div>
  );
}
