import { createClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import { expect, it, vi } from 'vitest';
import { listLmsClassTuitionInvoices } from './lms-class-tuition-invoices';

const wsId = 'c7100000-0000-4000-8000-000000000001';
const classId = 'c7100000-0000-4000-8000-000000000002';
const teacherId = 'c7100000-0000-4000-8000-000000000003';
const contactId = 'c7100000-0000-4000-8000-000000000004';
const invoiceId = 'c7100000-0000-4000-8000-000000000005';

it.each(['administrator', 'teacher'] as const)(
  'scopes %s invoice links to the active class and the current workspace learner contact',
  async (kind) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json([{ id: classId, links: [] }])
    );
    const db = createClient<Database>(
      'https://database.example.test',
      'test-key',
      {
        auth: { persistSession: false },
        global: { fetch },
      }
    );
    const rows = await listLmsClassTuitionInvoices({
      db,
      wsId,
      classId,
      contactId,
      after: invoiceId,
      limit: 21,
      scope: kind === 'teacher' ? { kind, contactId: teacherId } : { kind },
    });
    expect(rows).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const { searchParams } = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(Object.fromEntries(searchParams)).toMatchObject({
      ws_id: `eq.${wsId}`,
      id: `eq.${classId}`,
      archived: 'eq.false',
      is_guest: 'eq.false',
      'links.invoice.ws_id': `eq.${wsId}`,
      'links.invoice.contact.ws_id': `eq.${wsId}`,
      'links.invoice.contact.archived': 'eq.false',
      'links.invoice.contact.enrollment.group_id': `eq.${classId}`,
      'links.invoice.contact.enrollment.role': 'eq.STUDENT',
      'links.invoice.customer_id': `eq.${contactId}`,
      'links.invoice_id': `gt.${invoiceId}`,
      'links.order': 'invoice_id.asc',
      'links.limit': '21',
    });
    expect(searchParams.get('teacher.user_id')).toBe(
      kind === 'teacher' ? `eq.${teacherId}` : null
    );
    expect(searchParams.get('teacher.role')).toBe(
      kind === 'teacher' ? 'eq.TEACHER' : null
    );
    expect(searchParams.get('select')).not.toMatch(
      /paid_amount|note|price|wallet/
    );
  }
);
