'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@ncthub/ui/card';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface DatasetChartsProps {
  rowsOverTime: Array<{
    date: string;
    rows: number;
  }>;
  columnTypes: Array<{
    type: string;
    count: number;
  }>;
}

export function DatasetCharts({
  rowsOverTime,
  columnTypes,
}: DatasetChartsProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Data Growth</CardTitle>
          <CardDescription>Number of rows over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rowsOverTime}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) => {
                    return new Date(value).toLocaleDateString();
                  }}
                />
                <YAxis />
                <Tooltip
                  labelFormatter={(value) => {
                    return new Date(value).toLocaleDateString();
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="rows"
                  stroke="hsl(var(--primary))"
                  name="Rows"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Column Types</CardTitle>
          <CardDescription>Distribution of column data types</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={columnTypes}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" />
                <YAxis />
                <Tooltip />
                <Bar
                  dataKey="count"
                  fill="hsl(var(--primary))"
                  name="Columns"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
