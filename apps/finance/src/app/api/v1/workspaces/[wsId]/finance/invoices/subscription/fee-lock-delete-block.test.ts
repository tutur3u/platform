import { describe, expect, it } from 'vitest';
import { fakeSupabase } from '../../fee-locks/fake-supabase.test-utils';
import {
  FEE_LOCK_LINKED_INVOICE_CODE,
  FEE_LOCK_LINKED_INVOICE_MESSAGE,
  feeLockLinkedInvoiceResponse,
} from './fee-lock-delete-block';

const WS = '00000000-0000-4000-8000-0000000fe010';
const INVOICE = '00000000-0000-4000-8000-0000000fe851';

describe('feeLockLinkedInvoiceResponse', () => {
  it('explains a blocked delete of a pre-filled invoice in Vietnamese (409)', async () => {
    const db = fakeSupabase({
      fee_lock_invoice_links: { data: { id: 'link-1' } },
    });
    const response = await feeLockLinkedInvoiceResponse(
      db.client as never,
      WS,
      INVOICE
    );
    expect(response?.status).toBe(409);
    expect(await response?.json()).toEqual({
      code: FEE_LOCK_LINKED_INVOICE_CODE,
      message:
        'Hóa đơn này đã gắn với bảng chốt học phí nên không thể xóa. Nếu cần điều chỉnh, vui lòng liên hệ quản trị viên.',
    });
    expect(FEE_LOCK_LINKED_INVOICE_MESSAGE).toContain('chốt học phí');
    expect(
      db.filtered('fee_lock_invoice_links', 'ws_id', WS) &&
        db.filtered('fee_lock_invoice_links', 'invoice_id', INVOICE)
    ).toBe(true);
  });

  it('leaves other foreign-key blocks to the existing message', async () => {
    expect(
      await feeLockLinkedInvoiceResponse(
        fakeSupabase().client as never,
        WS,
        INVOICE
      )
    ).toBeNull();
  });
});
