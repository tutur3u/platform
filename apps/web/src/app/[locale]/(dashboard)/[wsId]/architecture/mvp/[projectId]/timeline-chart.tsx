'use client';

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface Milestone {
  name: string;
  description: string;
  estimatedDate: string;
}

interface TimelinePhase {
  phase: string;
  description: string;
  startDate: string;
  duration: string;
  dependencies?: string[];
  keyMilestones?: Milestone[];
}

interface TimelineChartProps {
  timeline: TimelinePhase[];
}

// Function to estimate duration in days from a string like "2-3 months" or "6 weeks"
function estimateDuration(durationStr: string): number {
  // For months
  const monthMatch = durationStr.match(/(\d+)(?:-(\d+))?\s*months?/i);
  if (monthMatch) {
    if (monthMatch[2]) {
      // Range like "2-3 months"
      return ((parseInt(monthMatch[1]) + parseInt(monthMatch[2])) / 2) * 30;
    }
    // Single value like "2 months"
    return parseInt(monthMatch[1]) * 30;
  }

  // For weeks
  const weekMatch = durationStr.match(/(\d+)(?:-(\d+))?\s*weeks?/i);
  if (weekMatch) {
    if (weekMatch[2]) {
      // Range like "2-3 weeks"
      return ((parseInt(weekMatch[1]) + parseInt(weekMatch[2])) / 2) * 7;
    }
    // Single value like "2 weeks"
    return parseInt(weekMatch[1]) * 7;
  }

  // For days
  const dayMatch = durationStr.match(/(\d+)(?:-(\d+))?\s*days?/i);
  if (dayMatch) {
    if (dayMatch[2]) {
      // Range like "20-30 days"
      return (parseInt(dayMatch[1]) + parseInt(dayMatch[2])) / 2;
    }
    // Single value like "20 days"
    return parseInt(dayMatch[1]);
  }

  // Default fallback
  return 30; // Default to 30 days if we can't parse
}

// Function to parse "Month X" or similar relative dates to a position
function parseRelativeDate(dateStr: string): number {
  const monthMatch = dateStr.match(/Month\s*(\d+)/i);
  if (monthMatch) {
    return parseInt(monthMatch[1]) * 30;
  }

  const weekMatch = dateStr.match(/Week\s*(\d+)/i);
  if (weekMatch) {
    return parseInt(weekMatch[1]) * 7;
  }

  // Default fallback - try to intelligently estimate
  if (
    dateStr.toLowerCase().includes('start') ||
    dateStr.toLowerCase().includes('beginning')
  ) {
    return 0;
  }

  if (
    dateStr.toLowerCase().includes('end') ||
    dateStr.toLowerCase().includes('completion')
  ) {
    return 365; // Default to end of year
  }

  return 0;
}

// Use CSS variables for colors from globals.css
const CHART_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
  'var(--color-dynamic-blue)',
  'var(--color-dynamic-green)',
  'var(--color-dynamic-orange)',
  'var(--color-dynamic-purple)',
  'var(--color-dynamic-red)',
];

export function TimelineChart({ timeline }: TimelineChartProps) {
  // Transform timeline data for the chart
  const chartData = useMemo(() => {
    let currentPosition = 0;

    return timeline.map((phase, index) => {
      const startPos = parseRelativeDate(phase.startDate);
      const duration = estimateDuration(phase.duration);

      // If it has an explicit start date, use that
      if (startPos > 0) {
        currentPosition = startPos;
      }

      const result = {
        name: phase.phase,
        start: currentPosition,
        duration: duration,
        end: currentPosition + duration,
        color: CHART_COLORS[index % CHART_COLORS.length],
        description: phase.description,
      };

      // Update current position for next phase
      currentPosition += duration;

      return result;
    });
  }, [timeline]);

  // Custom tooltip for the chart
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-md border bg-background p-2 text-sm shadow-sm">
          <p className="font-medium">{data.name}</p>
          <p className="text-muted-foreground">{data.description}</p>
          <p className="text-muted-foreground">
            Duration: {Math.round(data.duration)} days
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom shape for the bars
  const CustomBar = (props: any) => {
    const { x, y, width, height, fill } = props;

    return (
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        radius={[4, 4, 4, 4]}
      />
    );
  };

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 20, right: 30, left: 100, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            label={{
              value: 'Days',
              position: 'insideBottomRight',
              offset: -10,
            }}
          />
          <YAxis type="category" dataKey="name" width={80} />
          <Tooltip content={<CustomTooltip />} />
          <Bar
            dataKey="duration"
            fill="var(--color-chart-1)"
            shape={<CustomBar />}
          >
            {chartData.map((entry, index) => (
              <Rectangle
                key={`rect-${index}`}
                fill={entry.color}
                x={entry.start}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
