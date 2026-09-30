import type { InventorySalesPeriod } from '@tuturuuu/internal-api/inventory';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InventorySessionScope } from './inventory-session-scope';
import type { SaleCartLine, SaleStockOption } from './sale-create-items';
import { useSeasonSalePrices } from './season-sale-prices';
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.query }));
const period = {
  id: 'current',
  status: 'active',
  pricing_mode: 'scheduled',
  time_zone: 'Asia/Ho_Chi_Minh',
  starts_at: '2026-10-03',
  ends_at: '2026-10-04',
  product_scope: 'allowlist',
  product_ids: ['p'],
} as InventorySalesPeriod;
const option = {
  key: 'p:u:w',
  productId: 'p',
  unitId: 'u',
  warehouseId: 'w',
  price: 99000,
} as SaleStockOption;
const quote = {
  id: 'quote',
  period_id: 'current',
  product_id: 'p',
  unit_id: 'u',
  warehouse_id: 'w',
  price: 60000,
  currency: 'VND',
  valid_from: '2026-10-02T17:00:00Z',
  valid_to: '2026-10-04T17:00:00Z',
};
let result: ReturnType<typeof useSeasonSalePrices>;
let root: Root;
let container: HTMLDivElement;
const render = (selected = period, wsId = 'workspace', actorId = 'actor') => {
  function Harness() {
    result = useSeasonSalePrices({
      wsId,
      period: selected,
      open: true,
      currency: 'VND',
      options: [option, { ...option, key: 'old:u:w', productId: 'old' }],
    });
    return null;
  }
  act(() =>
    root.render(
      <InventorySessionScope actorId={actorId}>
        <Harness />
      </InventorySessionScope>
    )
  );
};
describe('season sale pricing UI', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T12:00:00Z'));
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: true,
    });
    mocks.query.mockReturnValue({
      data: { data: [quote], as_of: '2026-10-03T12:00:00Z' },
      isSuccess: true,
      isError: false,
    });
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    vi.clearAllMocks();
  });
  it('shows only current eligible season prices and detects stale cart amounts', () => {
    render();
    expect(result.options).toEqual([
      { ...option, price: 60000, priceId: 'quote' },
    ]);
    expect(
      result.cartIsCurrent([
        { ...option, price: 60000, priceId: 'quote', quantity: 1 },
      ])
    ).toBe(true);
    expect(result.cartIsCurrent([{ ...option, quantity: 1 }])).toBe(false);
  });
  it('never falls back to legacy catalog prices when a quote is missing', () => {
    mocks.query.mockReturnValue({
      data: { data: [], as_of: '2026-10-03T12:00:00Z' },
      isSuccess: true,
    });
    render();
    expect(result.options).toEqual([]);
    render({ ...period, id: 'future' });
    expect(result.options).toEqual([]);
  });
  it('scopes quote caches by workspace, actor and period', () => {
    render();
    expect(mocks.query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: [
          'inventory',
          'workspace',
          'period-prices',
          'actor',
          'current',
        ],
      })
    );
    render({ ...period, id: 'other' }, 'another-workspace', 'another-actor');
    expect(mocks.query).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: [
          'inventory',
          'another-workspace',
          'period-prices',
          'another-actor',
          'other',
        ],
      })
    );
    expect(result.options).toEqual([]);
  });
  it('blocks stale and offline checkout while preserving the displayed snapshot for review', () => {
    const lines: SaleCartLine[] = [
      { ...option, price: 60000, priceId: 'quote', quantity: 1 },
    ];
    render();
    vi.setSystemTime(new Date('2026-10-03T12:00:16Z'));
    render();
    expect(result.cartIsCurrent(lines)).toBe(false);
    vi.setSystemTime(new Date('2026-10-03T12:00:00Z'));
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    render();
    expect(result.cartIsCurrent(lines)).toBe(false);
  });
  it('applies legacy period allowlists without replacing custom prices', () => {
    render({ ...period, pricing_mode: 'legacy' });
    expect(result.options).toEqual([option]);
    expect(
      result.cartIsCurrent([{ ...option, price: 80000, quantity: 1 }])
    ).toBe(true);
    expect(
      result.cartIsCurrent([
        { ...option, productId: 'old', key: 'old:u:w', quantity: 1 },
      ])
    ).toBe(false);
  });
});
