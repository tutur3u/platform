import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type { LmsStaffScope } from './lms-staff-access';

type LinkedInvoice = {
  invoice_id: string;
  invoice: {
    customer_id: string;
    completed_at: string | null;
    subscription_months: string[] | null;
    valid_until: string | null;
  };
};

export async function listLmsClassTuitionInvoices({
  db,
  wsId,
  classId,
  scope,
  contactId,
  after,
  limit,
}: {
  db: TypedSupabaseClient;
  wsId: string;
  classId: string;
  scope: LmsStaffScope;
  contactId?: string;
  after?: string;
  limit: number;
}): Promise<LinkedInvoice[] | null> {
  const teacherJoin =
    scope.kind === 'teacher'
      ? ', teacher:workspace_user_groups_users!workspace_user_roles_users_role_id_fkey!inner(user_id, contact:workspace_users!workspace_user_roles_users_user_id_fkey!inner(id))'
      : '';
  const query = db
    .from('workspace_user_groups')
    .select(
      `id, links:finance_invoice_user_groups!finance_invoice_user_groups_user_group_id_fkey(invoice_id, invoice:finance_invoices!finance_invoice_user_groups_invoice_id_fkey!inner(customer_id, completed_at, subscription_months, valid_until, contact:workspace_users!finance_invoices_customer_id_fkey!inner(id, enrollment:workspace_user_groups_users!workspace_user_roles_users_user_id_fkey!inner(group_id))))${teacherJoin}`
    )
    .eq('ws_id', wsId)
    .eq('id', classId)
    .eq('archived', false)
    .eq('is_guest', false)
    .eq('links.invoice.ws_id', wsId)
    .eq('links.invoice.contact.ws_id', wsId)
    .eq('links.invoice.contact.archived', false)
    .eq('links.invoice.contact.enrollment.group_id', classId)
    .eq('links.invoice.contact.enrollment.role', 'STUDENT')
    .order('invoice_id', { referencedTable: 'links' })
    .limit(limit, { referencedTable: 'links' });

  if (scope.kind === 'teacher') {
    query
      .eq('teacher.user_id', scope.contactId)
      .eq('teacher.role', 'TEACHER')
      .eq('teacher.contact.ws_id', wsId)
      .eq('teacher.contact.archived', false);
  }
  if (contactId) query.eq('links.invoice.customer_id', contactId);
  if (after) query.gt('links.invoice_id', after);

  const { data, error } = await query
    .maybeSingle()
    .overrideTypes<{ id: string; links: LinkedInvoice[] }, { merge: false }>();
  if (error) throw error;
  return data?.links ?? null;
}
