import type { HabitTracker } from '@tuturuuu/types/primitives/HabitTracker';
import type { MiraToolContext } from '../mira-tool-types';

type QueryResult = { data: unknown; error: { message: string } | null };

/** Chainable Supabase query stub: every builder call resolves to `result`. */
export function queryStub(result: QueryResult) {
  const builder: Record<string, unknown> = {};
  const proxy: unknown = new Proxy(builder, {
    get(_target, prop) {
      if (prop === 'then')
        return (resolve: (value: QueryResult) => unknown) => resolve(result);
      if (prop === 'maybeSingle' || prop === 'single')
        return () => Promise.resolve(result);
      return () => proxy;
    },
  });
  return proxy;
}

export function supabaseStub(tables: Record<string, QueryResult>) {
  return {
    from: (table: string) =>
      queryStub(tables[table] ?? { data: null, error: null }),
  } as unknown as MiraToolContext['supabase'];
}

export function trackerFixture(
  overrides: Partial<HabitTracker> = {}
): HabitTracker {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    ws_id: 'team-ws',
    name: 'Body Weight',
    color: 'INDIGO',
    icon: 'SlidersHorizontal',
    tracking_mode: 'daily_summary',
    target_period: 'daily',
    target_operator: 'gte',
    target_value: 70,
    primary_metric_key: 'weight',
    aggregation_strategy: 'max',
    input_schema: [
      { key: 'weight', label: 'Body Weight', type: 'number', unit: 'kg' },
    ],
    quick_add_values: [],
    freeze_allowance: 1,
    recovery_window_periods: 1,
    start_date: '2026-01-01',
    is_active: true,
    use_case: 'body_weight',
    composer_config: { unit: 'kg', supported_units: ['kg', 'lb'] },
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}
