export const INVENTORY_AUTO_SET_NEW_SALES_PERIOD_CONFIG_ID =
  'inventory_auto_set_new_sales_period_as_default';

export const INVENTORY_DEFAULT_SALES_PERIOD_CONFIG_ID =
  'inventory_default_sales_period_id';

export type SalesPeriodAutoDefaultStatus = 'unchanged' | 'updated' | 'failed';

export type SalesPeriodAutoDefaultNotice =
  | 'unavailable'
  | 'denied'
  | 'on'
  | 'off';

export type SalesPeriodAutoDefaultPlan =
  | { action: 'unchanged' }
  | { action: 'failed' }
  | { action: 'update'; periodId: string; wsId: string };

export function isSalesPeriodAutoDefaultEnabled(
  stored: string | null | undefined
) {
  return stored === 'true';
}

export function serializeSalesPeriodAutoDefault(enabled: boolean) {
  return enabled ? 'true' : 'false';
}

export function loadedSalesPeriodAutoDefault(
  value: boolean | null | undefined
): boolean | null {
  if (value === true || value === false) return value;
  return null;
}

export function canEditLoadedSalesDefaults(
  canEdit: boolean | null | undefined
) {
  return canEdit === true;
}

export function autoSetWriteValue(input: {
  canEdit: boolean | null | undefined;
  enabled: boolean | null | undefined;
}): boolean | undefined {
  if (!canEditLoadedSalesDefaults(input.canEdit)) return undefined;
  const enabled = loadedSalesPeriodAutoDefault(input.enabled);
  if (enabled === null) return undefined;
  return enabled;
}

export function salesPeriodAutoDefaultNotice(input: {
  canEdit: boolean | null | undefined;
  enabled: boolean | null | undefined;
}): SalesPeriodAutoDefaultNotice {
  if (loadedSalesPeriodAutoDefault(input.enabled) === null) {
    return 'unavailable';
  }
  if (!canEditLoadedSalesDefaults(input.canEdit)) return 'denied';
  return input.enabled === true ? 'on' : 'off';
}

export function planSalesPeriodAutoDefault(input: {
  periodId: string | null | undefined;
  periodWsId: string | null | undefined;
  policyReadFailed: boolean;
  policyStored: string | null | undefined;
  wsId: string;
}): SalesPeriodAutoDefaultPlan {
  if (input.policyReadFailed) return { action: 'failed' };
  if (!isSalesPeriodAutoDefaultEnabled(input.policyStored)) {
    return { action: 'unchanged' };
  }
  if (!input.periodId || input.periodWsId !== input.wsId) {
    return { action: 'failed' };
  }
  return { action: 'update', periodId: input.periodId, wsId: input.wsId };
}
