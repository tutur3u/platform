import { toast } from '@tuturuuu/ui/sonner';
import { useCallback, useEffect, useRef } from 'react';
import type {
  Product,
  ProductInventory,
  SelectedProductItem,
  UserGroupProducts,
} from '../types';
import { getEffectiveDays, getTotalSessionsForGroups } from '../utils';

interface UseSubscriptionAutoSelectionProps {
  enabled: boolean;
  selectedGroupIds: string[];
  selectedMonth: string;
  prefillAmount?: number;
  groupProducts: UserGroupProducts[];
  products: Product[];
  userGroups: any[];
  useAttendanceBased: boolean;
  userAttendance: { status: string; date: string }[];
  t: any;
  onSelectedProductsChange: (products: SelectedProductItem[]) => void;
}

const buildAutoSelectedProductsForGroup = (
  groupLinked: UserGroupProducts[],
  allProducts: Product[],
  attendanceDays: number
) => {
  let fallbackTriggered = false;
  const results: SelectedProductItem[] = [];

  for (const linkItem of groupLinked || []) {
    const productId = linkItem?.workspace_products?.id;
    if (!productId) continue;

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
        ? attendanceDays
        : Math.min(attendanceDays, chosenInventory.amount);

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
  t,
  onSelectedProductsChange,
}: UseSubscriptionAutoSelectionProps) {
  const previousGroupIdRef = useRef<string>('');
  const fallbackToastShownRef = useRef<boolean>(false);
  const initialPrefillUsedRef = useRef<boolean>(false);

  const updateSelectedProducts = useCallback(
    (attendanceDays: number) => {
      const { autoSelected, fallbackTriggered } =
        buildAutoSelectedProductsForGroup(
          groupProducts,
          products,
          attendanceDays
        );

      onSelectedProductsChange(autoSelected);

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
      selectedGroupIds.length === 0 ||
      groupProducts.length === 0
    ) {
      return;
    }

    const currentGroupIdsKey = selectedGroupIds.sort().join(',');
    const isGroupChanged = previousGroupIdRef.current !== currentGroupIdsKey;
    previousGroupIdRef.current = currentGroupIdsKey;

    if (!isGroupChanged) return;

    fallbackToastShownRef.current = false;

    const totalSessions = getTotalSessionsForGroups(
      userGroups,
      selectedGroupIds,
      selectedMonth
    );

    const shouldUsePrefill =
      prefillAmount !== undefined && !initialPrefillUsedRef.current;
    const attendanceDays = shouldUsePrefill
      ? prefillAmount
      : getEffectiveDays(userAttendance, totalSessions, useAttendanceBased);

    updateSelectedProducts(attendanceDays);

    if (shouldUsePrefill) {
      initialPrefillUsedRef.current = true;
    }
  }, [
    enabled,
    selectedGroupIds,
    selectedMonth,
    prefillAmount,
    userAttendance,
    groupProducts,
    userGroups,
    useAttendanceBased,
    updateSelectedProducts,
  ]);

  // Auto-add group products based on attendance when group is selected
  useEffect(() => {
    if (
      !enabled ||
      selectedGroupIds.length === 0 ||
      groupProducts.length === 0
    ) {
      return;
    }

    if (prefillAmount !== undefined && !initialPrefillUsedRef.current) {
      return;
    }

    const totalSessions = getTotalSessionsForGroups(
      userGroups,
      selectedGroupIds,
      selectedMonth
    );

    const shouldUsePrefill =
      prefillAmount !== undefined && initialPrefillUsedRef.current;
    const attendanceDays = shouldUsePrefill
      ? prefillAmount
      : getEffectiveDays(userAttendance, totalSessions, useAttendanceBased);

    if (attendanceDays === 0) return;

    const { autoSelected, fallbackTriggered } =
      buildAutoSelectedProductsForGroup(
        groupProducts,
        products,
        attendanceDays
      );

    if (autoSelected.length === 0) return;

    onSelectedProductsChange(autoSelected);

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
    selectedGroupIds,
    selectedMonth,
    userAttendance?.length,
    prefillAmount,
    groupProducts,
    userGroups,
    useAttendanceBased,
    t,
    userAttendance,
    onSelectedProductsChange,
    products,
  ]);
}
