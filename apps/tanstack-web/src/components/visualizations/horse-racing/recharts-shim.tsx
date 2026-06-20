import type { CSSProperties, ReactNode } from 'react';

type ChartProps = {
  children?: ReactNode;
  className?: string;
  data?: unknown[];
  height?: number | string;
  style?: CSSProperties;
  width?: number | string;
};

type PrimitiveChartProps = ChartProps & Record<string, unknown>;

function ChartBox({ children, className, style }: ChartProps) {
  return (
    <div
      className={className}
      style={{
        alignItems: 'center',
        border: '1px solid hsl(var(--border))',
        borderRadius: 8,
        display: 'flex',
        height: '100%',
        justifyContent: 'center',
        minHeight: 160,
        ...style,
      }}
    >
      <div className="text-center text-muted-foreground text-sm">
        Chart preview
      </div>
      <div className="sr-only">{children}</div>
    </div>
  );
}

export function ResponsiveContainer({ children }: ChartProps) {
  return <ChartBox>{children}</ChartBox>;
}

export function BarChart({ children }: PrimitiveChartProps) {
  return <>{children}</>;
}

export function LineChart({ children }: PrimitiveChartProps) {
  return <>{children}</>;
}

export function Bar(_props: PrimitiveChartProps) {
  return null;
}

export function Line(_props: PrimitiveChartProps) {
  return null;
}

export function Tooltip(_props: PrimitiveChartProps) {
  return null;
}

export function XAxis(_props: PrimitiveChartProps) {
  return null;
}

export function YAxis(_props: PrimitiveChartProps) {
  return null;
}
