import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const directory = resolve(import.meta.dirname);

describe('Inventory analytics mobile layout', () => {
  it('uses the dashboard shell inset once and renders analytics health', () => {
    const source = readFileSync(
      resolve(directory, 'inventory-analytics-client.tsx'),
      'utf8'
    );

    expect(source).toContain('<main className="grid min-w-0 gap-3 sm:gap-5">');
    expect(source).not.toContain('xl:p-6');
    expect(source).toContain('<AnalyticsObservability');
    expect(source).toContain('text-xl tracking-tight sm:text-3xl');
  });

  it('uses compact charts and native mobile warehouse cards', () => {
    const charts = readFileSync(
      resolve(directory, 'analytics-visuals.tsx'),
      'utf8'
    );
    const insights = readFileSync(
      resolve(directory, 'analytics-insights.tsx'),
      'utf8'
    );

    expect(charts).toContain('h-56 w-full sm:h-72');
    expect(charts).toContain('h-52 w-full sm:h-64');
    expect(insights).toContain('sm:hidden');
    expect(insights).toContain('hidden overflow-x-auto sm:block');
    expect(insights).toContain('<MobileWarehouseMetric');
  });
});
