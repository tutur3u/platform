import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import type { ReactNode } from 'react';

/**
 * A titled card for a chart: heading, one line of context, optional controls
 * on the right, and the chart and its notes below.
 */
export function ChartCard({
  id,
  title,
  description,
  actions,
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card
      role="region"
      aria-labelledby={id}
      className={`min-w-0 ${className ?? ''}`}
    >
      <CardHeader className="flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="grid min-w-0 gap-1.5">
          <CardTitle
            id={id}
            role="heading"
            aria-level={2}
            className="text-base"
          >
            {title}
          </CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </div>
        {actions}
      </CardHeader>
      <CardContent className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 p-4 pt-0 sm:p-5 sm:pt-0">
        {children}
      </CardContent>
    </Card>
  );
}

/** The chart's figures as a table for assistive technology and crawlers. */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: readonly string[];
  rows: readonly { label: string; values: readonly (string | number)[] }[];
}) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <td />
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {row.values.map((value, index) => (
                <td key={columns[index]}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
