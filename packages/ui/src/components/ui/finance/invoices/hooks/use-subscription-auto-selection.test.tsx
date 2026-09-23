import { renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Product, SelectedProductItem, UserGroupProducts } from '../types';
import type { UserGroup } from '../utils';
import { useSubscriptionAutoSelection } from './use-subscription-auto-selection';

const translate = (key: string) => key;
vi.mock('next-intl', () => ({ useTranslations: () => translate }));
vi.mock('@tuturuuu/ui/sonner', () => ({ toast: vi.fn() }));

const inventory = {
  unit_id: 'unit',
  warehouse_id: 'warehouse',
  amount: null,
  min_amount: 0,
  price: 100,
  unit_name: 'Session',
  warehouse_name: 'Main',
};
const products: Product[] = [
  {
    id: 'tuition',
    name: 'Tuition',
    manufacturer: null,
    description: null,
    usage: null,
    category: null,
    category_id: 'cat',
    ws_id: 'ws',
    created_at: null,
    inventory: [inventory],
  },
];
const groupProducts: UserGroupProducts[] = [
  {
    group_id: 'class-a',
    workspace_products: {
      id: 'tuition',
      name: 'Tuition',
      product_categories: { name: null },
    },
    inventory_units: { id: 'unit', name: 'Session' },
    warehouse_id: 'warehouse',
  },
];
const userGroups: UserGroup[] = [
  {
    workspace_user_groups: {
      id: 'class-a',
      name: 'Class A',
      starting_date: '2026-01-01',
      ending_date: null,
      sessions: ['2026-01-05', '2026-01-12'],
    } as NonNullable<UserGroup['workspace_user_groups']>,
  },
];
const baseProps = {
  enabled: true,
  selectedGroupIds: ['class-a'],
  selectedMonth: '2026-01',
  groupProducts,
  products,
  userGroups,
  useAttendanceBased: false,
  userAttendance: [],
  latestSubscriptionInvoices: [],
};

type Props = Omit<
  Parameters<typeof useSubscriptionAutoSelection>[0],
  'onSelectedProductsChange'
>;
function useSelection(props: Props) {
  const [selected, setSelected] = useState<SelectedProductItem[]>([]);
  useSubscriptionAutoSelection({
    ...props,
    onSelectedProductsChange: setSelected,
  });
  return selected;
}

describe('subscription selection reflects current billable sessions', () => {
  it('clears prior charges when switching to a month with no sessions', () => {
    const { result, rerender } = renderHook(useSelection, {
      initialProps: baseProps as Props,
    });
    expect(result.current.map((row) => row.quantity)).toEqual([2]);
    rerender({ ...baseProps, selectedMonth: '2026-02' });
    expect(result.current).toEqual([]);
  });

  it('clears prior charges after payment coverage makes the month fully paid', () => {
    const { result, rerender } = renderHook(useSelection, {
      initialProps: baseProps as Props,
    });
    expect(result.current).toHaveLength(1);
    rerender({
      ...baseProps,
      latestSubscriptionInvoices: [
        { group_id: 'class-a', valid_until: '2026-02-01' },
      ],
    });
    expect(result.current).toEqual([]);
  });

  it('keeps charges for an earlier gap when a later month was explicitly paid', () => {
    const { result } = renderHook(useSelection, {
      initialProps: {
        ...baseProps,
        latestSubscriptionInvoices: [
          {
            group_id: 'class-a',
            valid_until: '2026-03-01',
            covered_months: ['2026-02-01'],
          },
        ],
      } as Props,
    });
    expect(result.current.map((row) => row.quantity)).toEqual([2]);
  });

  it('clears charges for an explicitly paid month without relying on expiry', () => {
    const { result } = renderHook(useSelection, {
      initialProps: {
        ...baseProps,
        latestSubscriptionInvoices: [
          { group_id: 'class-a', covered_months: ['2026-01-01'] },
        ],
      } as Props,
    });
    expect(result.current).toEqual([]);
  });

  it('clears charges when linked inventory becomes unavailable', () => {
    const { result, rerender } = renderHook(useSelection, {
      initialProps: baseProps as Props,
    });
    expect(result.current).toHaveLength(1);
    rerender({
      ...baseProps,
      products: [{ ...products[0]!, inventory: [{ ...inventory, amount: 0 }] }],
    });
    expect(result.current).toEqual([]);
  });

  it('repopulates charges when switching back to a billable month', () => {
    const { result, rerender } = renderHook(useSelection, {
      initialProps: { ...baseProps, selectedMonth: '2026-02' } as Props,
    });
    expect(result.current).toEqual([]);
    rerender(baseProps);
    expect(result.current.map((row) => row.quantity)).toEqual([2]);
  });
});

describe('subscription class and inventory updates', () => {
  it('updates the selected price when inventory pricing refreshes', () => {
    const { result, rerender } = renderHook(useSelection, {
      initialProps: baseProps as Props,
    });
    expect(result.current[0]?.inventory.price).toBe(100);
    rerender({
      ...baseProps,
      products: [
        { ...products[0]!, inventory: [{ ...inventory, price: 150 }] },
      ],
    });
    expect(result.current[0]?.inventory.price).toBe(150);
  });

  it('keeps the unpaid class when another selected class is covered', () => {
    const otherGroup = {
      workspace_user_groups: {
        ...userGroups[0]!.workspace_user_groups!,
        id: 'class-b',
      },
    };
    const props: Props = {
      ...baseProps,
      selectedGroupIds: ['class-a', 'class-b'],
      userGroups: [...userGroups, otherGroup],
      groupProducts: [
        ...groupProducts,
        { ...groupProducts[0]!, group_id: 'class-b' },
      ],
    };
    const { result, rerender } = renderHook(useSelection, {
      initialProps: props,
    });
    expect(result.current.map((row) => row.quantity)).toEqual([2, 2]);
    rerender({
      ...props,
      latestSubscriptionInvoices: [
        { group_id: 'class-a', valid_until: '2026-02-01' },
      ],
    });
    expect(result.current.map((row) => row.quantity)).toEqual([2]);
  });

  it('counts only present and late attendance in attendance-based billing', () => {
    const props: Props = {
      ...baseProps,
      useAttendanceBased: true,
      userAttendance: [
        { group_id: 'class-a', date: '2026-01-05', status: 'PRESENT' },
        { group_id: 'class-a', date: '2026-01-12', status: 'LATE' },
        { group_id: 'class-a', date: '2026-01-19', status: 'ABSENT' },
        { group_id: 'class-b', date: '2026-01-05', status: 'PRESENT' },
      ],
    };
    const { result, rerender } = renderHook(useSelection, {
      initialProps: props,
    });
    expect(result.current.map((row) => row.quantity)).toEqual([2]);
    rerender({ ...props, userAttendance: [] });
    expect(result.current).toEqual([]);
  });

  it('respects finite stock and updates when stock recovers', () => {
    const props: Props = {
      ...baseProps,
      products: [{ ...products[0]!, inventory: [{ ...inventory, amount: 1 }] }],
    };
    const { result, rerender } = renderHook(useSelection, {
      initialProps: props,
    });
    expect(result.current.map((row) => row.quantity)).toEqual([1]);
    rerender(baseProps);
    expect(result.current.map((row) => row.quantity)).toEqual([2]);
  });

  it('does not populate selection while auto-selection is disabled', () => {
    const { result } = renderHook(useSelection, {
      initialProps: { ...baseProps, enabled: false },
    });
    expect(result.current).toEqual([]);
  });
});

describe('prefilled subscription quantities', () => {
  it('retains an explicit initial quantity until billing inputs change', () => {
    const props: Props = { ...baseProps, prefillAmount: 5 };
    const { result, rerender } = renderHook(useSelection, {
      initialProps: props,
    });
    expect(result.current.map((row) => row.quantity)).toEqual([5]);
    rerender(props);
    expect(result.current.map((row) => row.quantity)).toEqual([5]);
    rerender({ ...props, selectedMonth: '2026-02' });
    expect(result.current).toEqual([]);
    rerender(props);
    expect(result.current.map((row) => row.quantity)).toEqual([2]);
  });
});
