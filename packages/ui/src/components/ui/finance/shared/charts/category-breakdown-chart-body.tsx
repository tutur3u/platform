import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
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
  onToggleCategory: (key: string) => void;
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
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-72 w-full min-w-0 sm:h-80"
      >
        <BarChart data={chartData}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" opacity={0.3} />
          <XAxis
            dataKey="period"
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) =>
              formatCategoryBreakdownXAxisTick(String(value), interval, locale)
            }
            tick={{ fill: 'var(--foreground)', opacity: 0.7 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) =>
              typeof value === 'number' ? formatCompactValue(value) : value
            }
            tick={{ fill: 'var(--foreground)', opacity: 0.7 }}
            width={60}
          />
          <Tooltip
            cursor={{ fill: 'var(--foreground)', opacity: 0.05 }}
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
              key={category.key}
              dataKey={category.key}
              name={category.name}
              stackId="categories"
              fill={
                hiddenCategories.has(category.key)
                  ? 'transparent'
                  : category.color
              }
              radius={[0, 0, 0, 0]}
              maxBarSize={50}
              isAnimationActive={false}
              hide={hiddenCategories.has(category.key)}
            />
          ))}
        </BarChart>
      </ChartContainer>
      <CategoryBreakdownLegend
        categories={categories}
        hiddenCategories={hiddenCategories}
        onToggleCategory={onToggleCategory}
        formatValue={formatValue}
      />
    </div>
  );
}
