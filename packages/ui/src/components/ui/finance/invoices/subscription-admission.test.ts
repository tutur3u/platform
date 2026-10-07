import { describe, expect, it } from 'vitest';
import {
  hasInvalidSubscriptionLinks,
  isSubscriptionContextReady,
} from './subscription-admission';
import type { Product, UserGroupProducts } from './types';

const valid: UserGroupProducts = {
  group_id: 'g',
  workspace_products: { id: 'p', name: null, product_categories: null },
  inventory_units: { id: 'u', name: null },
  warehouse_id: null,
};
const products = [
  { id: 'p', inventory: [{ unit_id: 'u', amount: null }] },
] as Product[];
describe('entire linked billing admission', () => {
  it('accepts valid scoped links without imposing a category or warehouse', () => {
    expect(hasInvalidSubscriptionLinks([valid], products)).toBe(false);
  });
  it.each([
    { ...valid, inventory_units: null },
    { ...valid, workspace_products: null },
    { ...valid, inventory_units: { id: 'other', name: null } },
    { ...valid, inventory_units: { id: ' ', name: null } },
  ])(
    'blocks a malformed linked charge even when another charge is valid',
    (invalid) => {
      expect(hasInvalidSubscriptionLinks([valid, invalid], products)).toBe(
        true
      );
    }
  );
  it('blocks a disappeared catalog product', () => {
    expect(hasInvalidSubscriptionLinks([valid], [])).toBe(true);
  });
});
describe('authoritative schedule readiness', () => {
  const ready = {
    groupIds: ['g'],
    scheduledSessionsByGroupId: { g: [] },
    loading: false,
    error: null,
  };
  it('distinguishes an authoritative empty list from missing data', () => {
    expect(isSubscriptionContextReady(ready)).toBe(true);
    expect(
      isSubscriptionContextReady({
        ...ready,
        scheduledSessionsByGroupId: undefined,
      })
    ).toBe(false);
    expect(
      isSubscriptionContextReady({ ...ready, scheduledSessionsByGroupId: {} })
    ).toBe(false);
  });
  it('does not authorize creation while loading or after a failed refresh with retained data', () => {
    expect(isSubscriptionContextReady({ ...ready, loading: true })).toBe(false);
    expect(
      isSubscriptionContextReady({
        ...ready,
        error: new Error('synthetic unavailable'),
      })
    ).toBe(false);
  });
  it.each(['2026-02-30', '2026-13-01', '2026-01-01T00:00:00Z', 'not-a-date'])(
    'rejects malformed civil schedule receipt %s',
    (date) => {
      expect(
        isSubscriptionContextReady({
          ...ready,
          scheduledSessionsByGroupId: { g: [date] },
        })
      ).toBe(false);
    }
  );
});
