import {
  Activity,
  Server,
  TrendingDown,
  TrendingUp,
  Users,
} from '@tuturuuu/icons';

interface MetricCardData {
  title: string;
  value: number | string;
  change?: number;
  changeLabel?: string;
  trend?: 'up' | 'down' | 'stable';
  icon: React.ReactNode;
}

interface Props {
  metrics: MetricCardData[];
}

export default function MetricCards({ metrics }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric, index) => (
        <MetricCard key={index} metric={metric} />
      ))}
    </div>
  );
}

function MetricCard({ metric }: { metric: MetricCardData }) {
  const { title, value, change, changeLabel, trend, icon } = metric;

  const getTrendColor = () => {
    if (!trend || trend === 'stable') return 'text-muted-foreground';
    return trend === 'up' ? 'text-dynamic-green' : 'text-dynamic-red';
  };

  const getTrendIcon = () => {
    if (!trend || trend === 'stable') return null;
    return trend === 'up' ? (
      <TrendingUp className="h-4 w-4" />
    ) : (
      <TrendingDown className="h-4 w-4" />
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-6 transition-all hover:shadow-md">
      <div className="flex items-center justify-between">
        <div className="rounded-lg bg-primary/10 p-3">{icon}</div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 ${getTrendColor()}`}>
            {getTrendIcon()}
            <span className="font-semibold text-sm">
              {change > 0 ? '+' : ''}
              {change}%
            </span>
          </div>
        )}
      </div>
      <div className="mt-4">
        <h3 className="font-medium text-muted-foreground text-sm">{title}</h3>
        <p className="mt-2 font-bold text-3xl">{value.toLocaleString()}</p>
        {changeLabel && (
          <p className="mt-1 text-muted-foreground text-xs">{changeLabel}</p>
        )}
      </div>
    </div>
  );
}

// Export icon components for easy use
export { Activity, Server, Users };
