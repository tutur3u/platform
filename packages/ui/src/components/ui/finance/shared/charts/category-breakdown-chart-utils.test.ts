import { describe, expect, it } from 'vitest';
import { buildCategoryBreakdownChartData } from './category-breakdown-chart-utils';

const point = (
  id: string,
  name: string,
  total: number,
  period = '2026-09-01'
) => ({
  category_id: id,
  category_name: name,
  category_color: null,
  category_icon: null,
  total,
  period,
});

describe('category breakdown series', () => {
  it('keeps categories with the same name separate and sums repeated points', () => {
    const result = buildCategoryBreakdownChartData([
      point('a', 'Office', 10),
      point('b', 'Office', 20),
      point('a', 'Office', 5),
    ]);
    expect(result.categories.map((category) => category.total)).toEqual([
      20, 15,
    ]);
    expect(result.chartData[0]).toMatchObject({
      category_a: 15,
      category_b: 20,
    });
  });
  it('groups smaller categories without losing any period totals', () => {
    const result = buildCategoryBreakdownChartData(
      [
        point('a', 'A', 100),
        point('b', 'B', 20),
        point('c', 'C', 5),
        point('b', 'B', 3, '2026-08-01'),
      ],
      { limit: 1, otherLabel: 'Other' }
    );
    expect(
      result.categories.map((category) => [category.name, category.total])
    ).toEqual([
      ['A', 100],
      ['Other', 28],
    ]);
    expect(result.chartData).toEqual([
      { period: '2026-08-01', other_categories: 3 },
      { period: '2026-09-01', category_a: 100, other_categories: 25 },
    ]);
  });
  it('keeps arbitrary names out of chart data keys', () => {
    expect(
      buildCategoryBreakdownChartData([point('a', 'period', 10)]).chartData[0]
    ).toEqual({ period: '2026-09-01', category_a: 10 });
  });
});
