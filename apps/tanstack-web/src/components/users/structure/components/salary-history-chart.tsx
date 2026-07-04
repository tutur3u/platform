type SalaryHistoryPoint = {
  date: string;
  index: number;
  period: string;
  salary: number;
};

interface SalaryHistoryChartProps {
  data: SalaryHistoryPoint[];
}

export function SalaryHistoryChart({ data }: SalaryHistoryChartProps) {
  const width = 640;
  const height = 240;
  const padding = {
    bottom: 34,
    left: 56,
    right: 20,
    top: 18,
  };
  const salaries = data.map((point) => point.salary);
  const minSalary = Math.min(...salaries);
  const maxSalary = Math.max(...salaries);
  const salarySpan = Math.max(maxSalary - minSalary, 1);
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', {
      currency: 'USD',
      maximumFractionDigits: 0,
      style: 'currency',
    }).format(value);
  const formatCompactSalary = (value: number) =>
    `$${(value / 1000).toFixed(0)}k`;
  const points = data.map((point, index) => {
    const x =
      padding.left + (index / Math.max(data.length - 1, 1)) * chartWidth;
    const y =
      padding.top + (1 - (point.salary - minSalary) / salarySpan) * chartHeight;

    return {
      ...point,
      x,
      y,
    };
  });
  const yTicks = [maxSalary, (maxSalary + minSalary) / 2, minSalary];

  return (
    <div className="h-full rounded-lg border border-border bg-background/60 p-2">
      <svg
        aria-label="Salary history"
        className="h-full w-full overflow-visible text-dynamic-blue"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <g className="text-muted-foreground">
          {yTicks.map((tick) => {
            const y =
              padding.top + (1 - (tick - minSalary) / salarySpan) * chartHeight;

            return (
              <g key={tick}>
                <line
                  stroke="currentColor"
                  strokeDasharray="4 4"
                  strokeOpacity="0.18"
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                />
                <text
                  fill="currentColor"
                  fontSize="12"
                  textAnchor="end"
                  x={padding.left - 10}
                  y={y + 4}
                >
                  {formatCompactSalary(tick)}
                </text>
              </g>
            );
          })}
        </g>

        <polyline
          fill="none"
          points={points.map((point) => `${point.x},${point.y}`).join(' ')}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />

        {points.map((point) => (
          <g key={`${point.period}-${point.date}`}>
            <title>{`${point.period}: ${formatCurrency(point.salary)}`}</title>
            <circle
              cx={point.x}
              cy={point.y}
              fill="currentColor"
              r="5"
              stroke="hsl(var(--background))"
              strokeWidth="2"
            />
            <text
              className="text-muted-foreground"
              fill="currentColor"
              fontSize="12"
              textAnchor="middle"
              x={point.x}
              y={height - 10}
            >
              {`Period ${point.index + 1}`}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export type { SalaryHistoryPoint };
