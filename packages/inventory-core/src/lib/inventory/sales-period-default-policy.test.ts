import { describe, expect, it } from 'vitest';
import {
  autoSetWriteValue,
  canEditLoadedSalesDefaults,
  isSalesPeriodAutoDefaultEnabled,
  loadedSalesPeriodAutoDefault,
  planSalesPeriodAutoDefault,
  salesPeriodAutoDefaultNotice,
  serializeSalesPeriodAutoDefault,
} from './sales-period-default-policy';

describe('sales period auto-default policy', () => {
  it('enables the policy only for the exact stored true value', () => {
    expect(isSalesPeriodAutoDefaultEnabled('true')).toBe(true);
    for (const stored of [null, undefined, '', 'false', 'TRUE', '1', 'yes']) {
      expect(isSalesPeriodAutoDefaultEnabled(stored)).toBe(false);
    }
    expect(serializeSalesPeriodAutoDefault(true)).toBe('true');
    expect(serializeSalesPeriodAutoDefault(false)).toBe('false');
  });

  it('keeps a missing loaded choice unknown so a save cannot clear it', () => {
    expect(loadedSalesPeriodAutoDefault(undefined)).toBeNull();
    expect(loadedSalesPeriodAutoDefault(null)).toBeNull();
    expect(loadedSalesPeriodAutoDefault(true)).toBe(true);
    expect(loadedSalesPeriodAutoDefault(false)).toBe(false);
    expect(canEditLoadedSalesDefaults(true)).toBe(true);
    expect(canEditLoadedSalesDefaults(false)).toBe(false);
    expect(canEditLoadedSalesDefaults(undefined)).toBe(false);
  });

  it('omits the settings write unless the loaded choice is known and editable', () => {
    expect(autoSetWriteValue({ canEdit: true, enabled: null })).toBeUndefined();
    expect(
      autoSetWriteValue({ canEdit: false, enabled: false })
    ).toBeUndefined();
    expect(
      autoSetWriteValue({ canEdit: undefined, enabled: true })
    ).toBeUndefined();
    expect(autoSetWriteValue({ canEdit: true, enabled: false })).toBe(false);
    expect(autoSetWriteValue({ canEdit: true, enabled: true })).toBe(true);
  });

  it('plans creation from the saved workspace policy', () => {
    expect(
      planSalesPeriodAutoDefault({
        periodId: 'period-2',
        periodWsId: 'ws-real',
        policyReadFailed: false,
        policyStored: null,
        wsId: 'ws-real',
      })
    ).toEqual({ action: 'unchanged' });
    expect(
      planSalesPeriodAutoDefault({
        periodId: 'period-2',
        periodWsId: 'ws-real',
        policyReadFailed: false,
        policyStored: 'false',
        wsId: 'ws-real',
      })
    ).toEqual({ action: 'unchanged' });
    expect(
      planSalesPeriodAutoDefault({
        periodId: 'period-2',
        periodWsId: 'ws-real',
        policyReadFailed: false,
        policyStored: 'true',
        wsId: 'ws-real',
      })
    ).toEqual({ action: 'update', periodId: 'period-2', wsId: 'ws-real' });
    expect(
      planSalesPeriodAutoDefault({
        periodId: 'period-2',
        periodWsId: 'other-ws',
        policyReadFailed: false,
        policyStored: 'true',
        wsId: 'ws-real',
      })
    ).toEqual({ action: 'failed' });
    expect(
      planSalesPeriodAutoDefault({
        periodId: '',
        periodWsId: 'ws-real',
        policyReadFailed: false,
        policyStored: 'true',
        wsId: 'ws-real',
      })
    ).toEqual({ action: 'failed' });
    expect(
      planSalesPeriodAutoDefault({
        periodId: 'period-2',
        periodWsId: 'ws-real',
        policyReadFailed: true,
        policyStored: 'true',
        wsId: 'ws-real',
      })
    ).toEqual({ action: 'failed' });
  });

  it('chooses the creation-screen notice from the shared loaded policy', () => {
    expect(salesPeriodAutoDefaultNotice({ canEdit: true, enabled: null })).toBe(
      'unavailable'
    );
    expect(
      salesPeriodAutoDefaultNotice({ canEdit: false, enabled: true })
    ).toBe('denied');
    expect(salesPeriodAutoDefaultNotice({ canEdit: true, enabled: true })).toBe(
      'on'
    );
    expect(
      salesPeriodAutoDefaultNotice({ canEdit: true, enabled: false })
    ).toBe('off');
  });
});
