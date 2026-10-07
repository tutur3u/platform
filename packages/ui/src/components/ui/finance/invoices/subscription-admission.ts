import type { Product, UserGroupProducts } from './types';
import {
  getMonthStartDate,
  isSubscriptionRangeFullyPaidForGroups,
  parseLocalCalendarDate,
  type SubscriptionCoverageInvoice,
} from './utils';

export function hasInvalidSubscriptionLinks(
  links: UserGroupProducts[],
  products: Product[]
): boolean {
  return links.some((link) => {
    const productId = link.workspace_products?.id;
    const unitId = link.inventory_units?.id;
    if (
      typeof productId !== 'string' ||
      !productId.trim() ||
      typeof unitId !== 'string' ||
      !unitId.trim()
    )
      return true;
    const product = products.find((item) => item.id === productId);
    return (
      !product ||
      !Array.isArray(product.inventory) ||
      !product.inventory.some((inventory) => inventory.unit_id === unitId)
    );
  });
}

export function isSubscriptionContextReady({
  groupIds,
  scheduledSessionsByGroupId,
  loading,
  error,
}: {
  groupIds: string[];
  scheduledSessionsByGroupId?: Record<string, string[]>;
  loading: boolean;
  error: unknown;
}): boolean {
  return (
    !loading &&
    !error &&
    !!scheduledSessionsByGroupId &&
    groupIds.every(
      (id) =>
        Object.hasOwn(scheduledSessionsByGroupId, id) &&
        Array.isArray(scheduledSessionsByGroupId[id]) &&
        scheduledSessionsByGroupId[id]!.every(
          (date) =>
            typeof date === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(date) &&
            !Number.isNaN(parseLocalCalendarDate(date).getTime())
        )
    )
  );
}

export function isSelectedSubscriptionRangePaid(
  groupIds: string[],
  month: string,
  monthCount: number,
  invoices: SubscriptionCoverageInvoice[]
): boolean {
  if (
    !groupIds.length ||
    !month ||
    Number.isNaN(getMonthStartDate(month).getTime())
  )
    return false;
  return isSubscriptionRangeFullyPaidForGroups(
    groupIds,
    month,
    monthCount,
    invoices
  );
}

export function getSubscriptionBlockReason(
  invalidLinks: boolean,
  ready: boolean,
  pending: boolean,
  errors: unknown[],
  groupIds: string[],
  scheduledSessionsByGroupId?: Record<string, string[]>
) {
  if (invalidLinks) return 'invalid_subscription_inventory' as const;
  if (
    !ready ||
    !isSubscriptionContextReady({
      groupIds,
      scheduledSessionsByGroupId,
      loading: pending,
      error: errors.some(Boolean),
    })
  )
    return 'subscription_context_not_ready' as const;
  return undefined;
}
