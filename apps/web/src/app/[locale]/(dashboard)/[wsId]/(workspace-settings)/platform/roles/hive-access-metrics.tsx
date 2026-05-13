type HiveAccessMetricsProps = {
  hiveEnabledTotal: number;
  labels: {
    matchingUsers: string;
    total: string;
    visible: string;
  };
  totalUsers: number;
  visibleHiveEnabled: number;
};

export function HiveAccessMetrics({
  hiveEnabledTotal,
  labels,
  totalUsers,
  visibleHiveEnabled,
}: HiveAccessMetricsProps) {
  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <div className="rounded-md bg-dynamic-muted/40 p-3">
        <div className="font-semibold tabular-nums">{hiveEnabledTotal}</div>
        <div className="text-dynamic-muted-foreground text-xs">
          {labels.total}
        </div>
      </div>
      <div className="rounded-md bg-dynamic-green/10 p-3">
        <div className="font-semibold text-dynamic-green tabular-nums">
          {visibleHiveEnabled}
        </div>
        <div className="text-dynamic-muted-foreground text-xs">
          {labels.visible}
        </div>
      </div>
      <div className="rounded-md bg-dynamic-muted/40 p-3">
        <div className="font-semibold tabular-nums">{totalUsers}</div>
        <div className="text-dynamic-muted-foreground text-xs">
          {labels.matchingUsers}
        </div>
      </div>
    </div>
  );
}
