import type { LegendPayload } from 'recharts';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChartConfig } from '../../../chart';
import { ChartContainer } from '../../../chart';
import { CategoryBreakdownLegend } from './category-breakdown-chart-legend';
import { CategoryBreakdownTooltipContent } from './category-breakdown-chart-tooltip';
import type {
  CategoryBreakdownCategory,
  CategoryBreakdownChartDatum,
  ChartInterval,
} from './category-breakdown-chart-types';
import { formatCategoryBreakdownXAxisTick } from './category-breakdown-chart-utils';

interface CategoryBreakdownChartBodyProps {
  categories: CategoryBreakdownCategory[];
  chartConfig: ChartConfig;
  chartData: CategoryBreakdownChartDatum[];
  formatCompactValue: (value: number) => string;
  formatValue: (value: number) => string;
  hiddenCategories: Set<string>;
  interval: ChartInterval;
  locale: string;
  onToggleCategory: (entry: LegendPayload) => void;
}

export function CategoryBreakdownChartBody({
  categories,
  chartConfig,
  chartData,
  formatCompactValue,
  formatValue,
  hiddenCategories,
  interval,
  locale,
  onToggleCategory,
}: CategoryBreakdownChartBodyProps) {
  return (
    <ChartContainer config={chartConfig} className="h-80 w-full">
      <BarChart data={chartData}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
        <XAxis
          dataKey="period"
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) =>
            formatCategoryBreakdownXAxisTick(String(value), interval, locale)
          }
          tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) =>
            typeof value === 'number' ? formatCompactValue(value) : value
          }
          tick={{ fill: 'hsl(var(--foreground))', opacity: 0.7 }}
          width={60}
        />
        <Legend
          content={(props) => (
            <CategoryBreakdownLegend
              hiddenCategories={hiddenCategories}
              onToggleCategory={onToggleCategory}
              payload={props.payload}
            />
          )}
          iconType="rect"
          iconSize={12}
        />
        <Tooltip
          cursor={{ fill: 'hsl(var(--foreground))', opacity: 0.05 }}
          wrapperStyle={{
            outline: 'none',
            zIndex: 100,
          }}
          contentStyle={{
            backgroundColor: 'transparent',
            border: 'none',
            padding: 0,
            boxShadow: 'none',
          }}
          content={
            <CategoryBreakdownTooltipContent
              locale={locale}
              interval={interval}
              formatValue={formatValue}
              categories={categories}
              hiddenCategories={hiddenCategories}
            />
          }
        />
        {categories.map((category) => (
          <Bar
            key={category.id || 'uncategorized'}
            dataKey={category.name}
            stackId="categories"
            fill={
              hiddenCategories.has(category.name)
                ? 'transparent'
                : category.color
            }
            radius={[0, 0, 0, 0]}
            maxBarSize={50}
            hide={hiddenCategories.has(category.name)}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
