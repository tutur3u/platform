'use client';

import { useMemo } from 'react';

interface DistributionItem {
  label: string;
  value: number;
  color?: string;
}

interface DistributionChartProps {
  data: DistributionItem[];
  title: string;
  total?: number;
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
  'hsl(var(--chart-7))',
  'hsl(var(--chart-8))',
];

export function DistributionChart({
  data,
  title,
  total: providedTotal,
}: DistributionChartProps) {
  const total = useMemo(
    () => providedTotal ?? data.reduce((sum, item) => sum + item.value, 0),
    [data, providedTotal]
  );

  const dataWithPercentage = useMemo(() => {
    return data
      .map((item, index) => ({
        ...item,
        percentage: total > 0 ? (item.value / total) * 100 : 0,
        color: item.color ?? COLORS[index % COLORS.length],
      }))
      .sort((a, b) => b.percentage - a.percentage);
  }, [data, total]);

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toLocaleString();
  };

  // Calculate SVG donut chart segments
  const donutSegments = useMemo(() => {
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    let currentOffset = 0;

    return dataWithPercentage.map((item) => {
      const segmentLength = (item.percentage / 100) * circumference;
      const segment = {
        ...item,
        strokeDasharray: `${segmentLength} ${circumference}`,
        strokeDashoffset: -currentOffset,
      };
      currentOffset += segmentLength;
      return segment;
    });
  }, [dataWithPercentage]);

  if (data.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
      {/* Donut Chart */}
      <div className="shrink-0">
        <svg width="160" height="160" viewBox="0 0 100 100" className="mx-auto">
          <title>{title}</title>
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth="12"
          />
          {donutSegments.map((segment, index) => (
            <circle
              key={index}
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke={segment.color}
              strokeWidth="12"
              strokeDasharray={segment.strokeDasharray}
              strokeDashoffset={segment.strokeDashoffset}
              transform="rotate(-90 50 50)"
              className="transition-all"
            />
          ))}
          <text
            x="50"
            y="45"
            textAnchor="middle"
            className="fill-foreground font-bold text-xs"
          >
            {formatNumber(total)}
          </text>
          <text
            x="50"
            y="55"
            textAnchor="middle"
            className="fill-muted-foreground text-[0.5rem]"
          >
            {title}
          </text>
        </svg>
      </div>

      {/* Legend */}
      <div className="flex-1 space-y-2">
        {dataWithPercentage.map((item, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-4 rounded-lg border p-3 hover:bg-muted/50"
          >
            <div className="flex items-center gap-3">
              <div
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className="font-medium text-sm">{item.label}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${item.percentage}%`,
                      backgroundColor: item.color,
                    }}
                  />
                </div>
                <span className="font-mono font-semibold text-sm">
                  {item.percentage.toFixed(1)}%
                </span>
              </div>
              <span className="font-mono text-muted-foreground text-sm">
                {formatNumber(item.value)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
