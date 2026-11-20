import {
  hasCompletedTuitionCoverage,
  type TuitionCoverage,
  vietnamBillingMonth,
} from '@tuturuuu/finance-core/tuition-coverage';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export type ClassTuitionScope =
  | { kind: 'administrator' }
  | { kind: 'student' | 'teacher'; contactId: string };

type Enrollment = { user_id: string; created_at: string | null };
type Roster = {
  starting_date: string | null;
  ending_date: string | null;
  roster: Enrollment[];
};

type Payment = TuitionCoverage & { customer_id: string };
const groupLink = 'workspace_user_roles_users_role_id_fkey';
const contactLink = 'workspace_user_roles_users_user_id_fkey';
const ledgerLimit = 1_000;

async function readRoster({
  db,
  wsId,
  classId,
  scope,
  after,
  limit,
}: {
  db: TypedSupabaseClient;
  wsId: string;
  classId: string;
  scope: ClassTuitionScope;
  after?: string;
  limit: number;
}) {
  const teacherJoin =
    scope.kind === 'teacher'
      ? `, teacher:workspace_user_groups_users!${groupLink}!inner(user_id, contact:workspace_users!${contactLink}!inner(id))`
      : '';
  const query = db
    .from('workspace_user_groups')
    .select(
      `starting_date, ending_date, roster:workspace_user_groups_users!${groupLink}(user_id, created_at, contact:workspace_users!${contactLink}!inner(id))${teacherJoin}`
    )
    .eq('id', classId)
    .eq('ws_id', wsId)
    .eq('archived', false)
    .eq('is_guest', false)
    .eq('roster.role', 'STUDENT')
    .eq('roster.contact.ws_id', wsId)
    .eq('roster.contact.archived', false)
    .order('user_id', { referencedTable: 'roster' })
    .limit(limit, { referencedTable: 'roster' });

  if (scope.kind === 'student') {
    query.eq('is_course_published', true).eq('roster.user_id', scope.contactId);
  }
  if (scope.kind === 'teacher') {
    query
      .eq('teacher.user_id', scope.contactId)
      .eq('teacher.role', 'TEACHER')
      .eq('teacher.contact.ws_id', wsId)
      .eq('teacher.contact.archived', false);
  }
  if (after) query.gt('roster.user_id', after);

  const { data, error } = await query
    .maybeSingle()
    .overrideTypes<Roster, { merge: false }>();
  if (error) throw error;
  if (scope.kind === 'student' && !data?.roster.length) return null;
  return data;
}

export async function listClassTuition({
  month,
  ...input
}: Parameters<typeof readRoster>[0] & { month: string }) {
  const { db, wsId, classId, limit } = input;
  const group = await readRoster({ ...input, limit: limit + 1 });
  if (!group) return null;

  const page = group.roster.slice(0, limit);
  const nextCursor =
    group.roster.length > limit ? (page.at(-1)?.user_id ?? null) : null;
  const contactIds = page.map(({ user_id }) => user_id);
  if (!contactIds.length) return { data: [], nextCursor };

  const { data: config, error: configError } = await db
    .rpc('fetch_workspace_invoice_configs', { p_ws_id: wsId })
    .single();
  if (configError) throw configError;

  const blockedGroups = config.blocked_pending_group_ids ?? [];
  const groupExcluded = blockedGroups.includes(classId);
  const [outstanding, completed, blocked] = await Promise.all([
    groupExcluded
      ? null
      : db
          .rpc('get_pending_invoices_base', {
            p_ws_id: wsId,
            p_use_attendance_based: config.use_attendance_based,
          })
          .select('user_id')
          .eq('group_id', classId)
          .eq('month', month)
          .in('user_id', contactIds)
          .limit(limit),
    db
      .from('finance_invoices')
      .select(
        'customer_id, subscription_months, valid_until, class:finance_invoice_user_groups!inner(user_group_id)'
      )
      .eq('ws_id', wsId)
      .eq('class.user_group_id', classId)
      .in('customer_id', contactIds)
      .not('completed_at', 'is', null)
      .or('subscription_months.not.is.null,valid_until.not.is.null')
      .limit(ledgerLimit)
      .overrideTypes<Payment[], { merge: false }>(),
    !groupExcluded && blockedGroups.length
      ? db
          .from('workspace_user_groups_users')
          .select(
            `user_id, group:workspace_user_groups!${groupLink}!inner(ws_id)`
          )
          .eq('group.ws_id', wsId)
          .in('group_id', blockedGroups)
          .in('user_id', contactIds)
          .limit(ledgerLimit)
      : null,
  ]);

  const error = outstanding?.error ?? completed.error ?? blocked?.error;
  if (error) throw error;
  if (
    !completed.data ||
    (outstanding && !outstanding.data) ||
    (blocked && !blocked.data)
  ) {
    throw new Error('Class tuition read returned incomplete Finance evidence');
  }
  if (
    completed.data.length >= ledgerLimit ||
    (blocked?.data?.length ?? 0) >= ledgerLimit
  ) {
    throw new Error('Class tuition read exceeded the ledger page limit');
  }

  const pendingIds = new Set(outstanding?.data?.map(({ user_id }) => user_id));
  const excludedIds = new Set(blocked?.data?.map(({ user_id }) => user_id));
  const coverageByContact = new Map<string, TuitionCoverage[]>();
  for (const invoice of completed.data) {
    const coverage = coverageByContact.get(invoice.customer_id) ?? [];
    coverage.push(invoice);
    coverageByContact.set(invoice.customer_id, coverage);
  }
  const currentMonth = vietnamBillingMonth(new Date());

  return {
    data: page.map(({ user_id, created_at }) => {
      const joinedMonth = created_at
        ? vietnamBillingMonth(new Date(created_at))
        : currentMonth;
      const startMonth = group.starting_date?.slice(0, 7) ?? joinedMonth;
      const endMonth = group.ending_date?.slice(0, 7) ?? currentMonth;
      const inClassPeriod =
        month >= joinedMonth &&
        month >= startMonth &&
        month <= endMonth &&
        month <= currentMonth;
      const status =
        pendingIds.has(user_id) && !excludedIds.has(user_id)
          ? 'pending'
          : inClassPeriod &&
              hasCompletedTuitionCoverage(
                month,
                coverageByContact.get(user_id) ?? []
              )
            ? 'paid'
            : groupExcluded || excludedIds.has(user_id)
              ? 'excluded'
              : 'no_billable_activity';
      return { contact_id: user_id, status };
    }),
    nextCursor,
  };
}
