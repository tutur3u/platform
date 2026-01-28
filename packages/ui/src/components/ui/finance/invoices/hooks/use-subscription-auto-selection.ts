import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type {
  Product,
  ProductInventory,
  SelectedProductItem,
  UserGroupProducts,
} from '../types';
import type { UserGroup } from '../utils';
import {
  getEffectiveAttendanceDays,
  getEffectiveDays,
  getSessionsForMonth,
  getSessionsUntilMonth,
  getTotalSessionsForGroups,
} from '../utils';

interface UseSubscriptionAutoSelectionProps {
  enabled: boolean;
  selectedGroupIds: string[];
  selectedMonth: string;
  prefillAmount?: number;
  groupProducts: UserGroupProducts[];
  products: Product[];
  userGroups: UserGroup[];
  useAttendanceBased: boolean;
  userAttendance: { status: string; date: string; group_id?: string }[];
  latestSubscriptionInvoices: {
    group_id?: string;
    valid_until?: string | null;
    created_at?: string | null;
  }[];
  onSelectedProductsChange: Dispatch<SetStateAction<SelectedProductItem[]>>;
}

export type UseSubscriptionAutoSelectionResult = undefined;

const buildAutoSelectedProductsForGroup = (
  groupLinked: UserGroupProducts[],
  allProducts: Product[],
  attendanceDays: number,
  groupAttendanceDaysMap: Record<string, number> = {}
) => {
  let fallbackTriggered = false;
  const results: SelectedProductItem[] = [];

  for (const linkItem of groupLinked || []) {
    const productId = linkItem?.workspace_products?.id;
    if (!productId) continue;

    const groupId = linkItem.group_id;
    const itemAttendanceDays =
      groupId && groupAttendanceDaysMap[groupId] !== undefined
        ? groupAttendanceDaysMap[groupId]
        : attendanceDays;

    const desiredUnitId = linkItem.inventory_units.id;
    const desiredWarehouseId = linkItem.warehouse_id;

    const product = allProducts.find((p) => p.id === productId);
    if (!product || !Array.isArray(product.inventory)) continue;

    const inventoriesByUnit = desiredUnitId
      ? product.inventory.filter((inv) => inv.unit_id === desiredUnitId)
      : product.inventory;

    if (!inventoriesByUnit.length) continue;

    let chosenInventory: ProductInventory | null = null;

    if (desiredWarehouseId) {
      chosenInventory =
        inventoriesByUnit.find(
          (inv) => inv.warehouse_id === desiredWarehouseId
        ) ||
        inventoriesByUnit.find(
          (inv) => inv.amount === null || (inv.amount && inv.amount > 0)
        ) ||
        inventoriesByUnit[0] ||
        null;
      if (
        !inventoriesByUnit.some(
          (inv) => inv.warehouse_id === desiredWarehouseId
        )
      ) {
        fallbackTriggered = true;
      }
    } else {
      chosenInventory =
        inventoriesByUnit.find(
          (inv) => inv.amount === null || (inv.amount && inv.amount > 0)
        ) ||
        inventoriesByUnit[0] ||
        null;
      fallbackTriggered = true;
    }

    if (!chosenInventory) continue;

    const finalQuantity =
      chosenInventory.amount === null
        ? itemAttendanceDays
        : Math.min(itemAttendanceDays, chosenInventory.amount);

    if (finalQuantity > 0) {
      results.push({
        product,
        inventory: chosenInventory,
        quantity: finalQuantity,
      } as SelectedProductItem);
    }
  }

  return { autoSelected: results, fallbackTriggered };
};

const areSelectedProductsEqual = (
  current: SelectedProductItem[],
  next: SelectedProductItem[]
) => {
  if (current.length !== next.length) return false;

  const toKey = (item: SelectedProductItem) =>
    `${item.product.id}|${item.inventory.unit_id}|${item.inventory.warehouse_id}|${item.quantity}`;

  const buildCounts = (items: SelectedProductItem[]) => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const key = toKey(item);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  };

  const currentCounts = buildCounts(current);
  const nextCounts = buildCounts(next);

  if (currentCounts.size !== nextCounts.size) return false;

  for (const [key, count] of currentCounts) {
    if (nextCounts.get(key) !== count) return false;
  }

  return true;
};

const computeGroupAttendanceDaysMap = (
  selectedGroupIds: string[],
  userGroups: UserGroup[],
  latestSubscriptionInvoices: {
    group_id?: string;
    valid_until?: string | null;
    created_at?: string | null;
  }[],
  selectedMonth: string,
  userAttendance: { status: string; date: string; group_id?: string }[],
  useAttendanceBased: boolean
) => {
  const groupAttendanceDaysMap: Record<string, number> = {};

  for (const groupId of selectedGroupIds) {
    const group = userGroups.find(
      (g) => g.workspace_user_groups?.id === groupId
    );
    if (!group) continue;

    const latestInvoice = latestSubscriptionInvoices.find(
      (inv) => inv.group_id === groupId
    );
    const validUntil = latestInvoice?.valid_until
      ? new Date(latestInvoice.valid_until)
      : null;

    const isGroupPaid = (() => {
      if (!validUntil) return false;
      const selectedMonthStart = new Date(`${selectedMonth}-01`);
      const validUntilMonthStart = new Date(validUntil);
      validUntilMonthStart.setDate(1);
      return selectedMonthStart < validUntilMonthStart;
    })();

    const sessionsArray = group.workspace_user_groups?.sessions || [];
    const groupSessions = isGroupPaid
      ? 0
      : validUntil
        ? getSessionsUntilMonth(sessionsArray, selectedMonth, validUntil)
        : getSessionsForMonth(sessionsArray, selectedMonth);

    if (useAttendanceBased) {
      const groupAttendance = isGroupPaid
        ? []
        : userAttendance.filter((a) => {
            if (a.group_id !== groupId) return false;
            if (!validUntil) return true;
            const attendanceDate = new Date(a.date);
            return attendanceDate >= validUntil;
          });
      groupAttendanceDaysMap[groupId] =
        getEffectiveAttendanceDays(groupAttendance);
    } else {
      groupAttendanceDaysMap[groupId] = groupSessions;
    }
  }

  return groupAttendanceDaysMap;
};

export function useSubscriptionAutoSelection({
  enabled,
  selectedGroupIds,
  selectedMonth,
  prefillAmount,
  groupProducts,
  products,
  userGroups,
  useAttendanceBased,
  userAttendance,
  latestSubscriptionInvoices,
  onSelectedProductsChange,
}: UseSubscriptionAutoSelectionProps): UseSubscriptionAutoSelectionResult {
  const t = useTranslations();
  const previousGroupIdRef = useRef<string>('');
  const fallbackToastShownRef = useRef<boolean>(false);
  const initialPrefillUsedRef = useRef<boolean>(false);
  const selectedGroupIdsKey = useMemo(
    () => [...selectedGroupIds].sort().join(','),
    [selectedGroupIds]
  );
  const sortedSelectedGroupIds = useMemo(
    () => (selectedGroupIdsKey ? selectedGroupIdsKey.split(',') : []),
    [selectedGroupIdsKey]
  );
  const groupAttendanceDaysMap = useMemo(
    () =>
      computeGroupAttendanceDaysMap(
        sortedSelectedGroupIds,
        userGroups,
        latestSubscriptionInvoices,
        selectedMonth,
        userAttendance,
        useAttendanceBased
      ),
    [
      sortedSelectedGroupIds,
      userGroups,
      latestSubscriptionInvoices,
      selectedMonth,
      userAttendance,
      useAttendanceBased,
    ]
  );

  const updateSelectedProducts = useCallback(
    (
      attendanceDays: number,
      groupAttendanceDaysMap: Record<string, number>
    ) => {
      const { autoSelected, fallbackTriggered } =
        buildAutoSelectedProductsForGroup(
          groupProducts,
          products,
          attendanceDays,
          groupAttendanceDaysMap
        );

      onSelectedProductsChange((prev) =>
        areSelectedProductsEqual(prev, autoSelected) ? prev : autoSelected
      );

      if (fallbackTriggered && !fallbackToastShownRef.current) {
        toast(
          t('ws-invoices.inventory_fallback_used', {
            default:
              'Some items used fallback warehouses due to missing preference.',
          })
        );
        fallbackToastShownRef.current = true;
      }
    },
    [groupProducts, products, t, onSelectedProductsChange]
  );

  useEffect(() => {
    if (
      !enabled ||
      sortedSelectedGroupIds.length === 0 ||
      groupProducts.length === 0
    ) {
      return;
    }

    const currentGroupIdsKey = sortedSelectedGroupIds.join(',');
    const isGroupChanged = previousGroupIdRef.current !== currentGroupIdsKey;
    previousGroupIdRef.current = currentGroupIdsKey;

    if (!isGroupChanged) return;

    fallbackToastShownRef.current = false;

    const totalSessions = getTotalSessionsForGroups(
      userGroups,
      sortedSelectedGroupIds,
      selectedMonth,
      latestSubscriptionInvoices
    );

    const shouldUsePrefill =
      prefillAmount !== undefined && !initialPrefillUsedRef.current;
    const attendanceDays = shouldUsePrefill
      ? prefillAmount
      : getEffectiveDays(userAttendance, totalSessions, useAttendanceBased);

    updateSelectedProducts(
      attendanceDays,
      shouldUsePrefill ? {} : groupAttendanceDaysMap
    );

    if (shouldUsePrefill) {
      initialPrefillUsedRef.current = true;
    }
  }, [
    enabled,
    sortedSelectedGroupIds,
    selectedMonth,
    prefillAmount,
    userAttendance,
    groupProducts,
    userGroups,
    useAttendanceBased,
    latestSubscriptionInvoices,
    updateSelectedProducts,
    groupAttendanceDaysMap,
  ]);

  // Auto-add group products based on attendance when group is selected
  useEffect(() => {
    if (
      !enabled ||
      sortedSelectedGroupIds.length === 0 ||
      groupProducts.length === 0
    ) {
      return;
    }

    if (prefillAmount !== undefined && !initialPrefillUsedRef.current) {
      return;
    }

    const totalSessions = getTotalSessionsForGroups(
      userGroups,
      sortedSelectedGroupIds,
      selectedMonth,
      latestSubscriptionInvoices
    );

    const attendanceDays = getEffectiveDays(
      userAttendance,
      totalSessions,
      useAttendanceBased
    );

    if (attendanceDays === 0) return;

    const { autoSelected, fallbackTriggered } =
      buildAutoSelectedProductsForGroup(
        groupProducts,
        products,
        attendanceDays,
        groupAttendanceDaysMap
      );

    if (autoSelected.length === 0) return;

    onSelectedProductsChange((prev) =>
      areSelectedProductsEqual(prev, autoSelected) ? prev : autoSelected
    );

    if (fallbackTriggered && !fallbackToastShownRef.current) {
      toast(
        t('ws-invoices.inventory_fallback_used', {
          default:
            'Some items used fallback warehouses due to missing preference.',
        })
      );
      fallbackToastShownRef.current = true;
    }
  }, [
    enabled,
    sortedSelectedGroupIds,
    selectedMonth,
    userAttendance?.length,
    prefillAmount,
    groupProducts,
    userGroups,
    useAttendanceBased,
    t,
    userAttendance,
    latestSubscriptionInvoices,
    onSelectedProductsChange,
    products,
    groupAttendanceDaysMap,
  ]);
}
