import {
  FEE_LOCK_EXPORT_TOO_MANY_CODE,
  feeLockSnapshotSchema,
} from '@tuturuuu/internal-api/finance-fee-lock-contracts';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { NextResponse } from 'next/server';
import type { FeeLockExportEntry } from '@/lib/fee-lock/export-rows';
import { FEE_LOCK_EXPORT_MAX_ROWS } from '@/lib/fee-lock/export-workbook';
import { feeLockErrorResponse } from '../access';

type DbError = { code?: string | null; message?: string | null } | null;
type Page<T> = PromiseLike<{ data: T[] | null; error: DbError }>;

// PostgREST caps a response at max_rows (1000), so every read pages; ids go
// in chunks to keep `in.(...)` URLs short.
const PAGE = 1000;
const ID_CHUNK = 200;

async function readPages<T>(
  query: (from: number, to: number) => Page<T>
): Promise<{ rows: T[]; error: DbError }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) return { rows, error };
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE) return { rows, error: null };
  }
}

async function readChunked<T>(
  ids: string[],
  query: (chunk: string[], from: number, to: number) => Page<T>
): Promise<{ rows: T[]; error: DbError }> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    const part = await readPages((from, to) => query(chunk, from, to));
    if (part.error) return part;
    rows.push(...part.rows);
  }
  return { rows, error: null };
}

const invalidSnapshot = () => {
  console.error('[fee-locks] export: snapshot does not match its lock');
  return NextResponse.json(
    { message: 'Internal server error' },
    { status: 500 }
  );
};

export type FeeLockExportLoad =
  | {
      entries: Array<[lockId: string, entry: FeeLockExportEntry]>;
      response?: never;
    }
  | { entries?: never; response: NextResponse };

/**
 * A month's fee locks for the export, every read scoped to `wsId`: locked
 * revisions from their immutable snapshots (checked against the lock), and
 * drafts (with `status: 'all'`) from live lines. `groupId` must belong to the
 * workspace (400) and keeps locks with a tuition line for that class. Sorted by
 * student name; more than FEE_LOCK_EXPORT_MAX_ROWS rows is a 400.
 */
export async function loadFeeLockExportEntries(
  sbAdmin: TypedSupabaseClient,
  wsId: string,
  {
    periodMonth,
    groupId,
    status,
  }: { periodMonth: string; groupId?: string; status: 'locked' | 'all' }
): Promise<FeeLockExportLoad> {
  if (groupId) {
    const { data: group, error } = await sbAdmin
      .from('workspace_user_groups')
      .select('id')
      .eq('id', groupId)
      .eq('ws_id', wsId)
      .maybeSingle();
    if (error) return { response: feeLockErrorResponse(error) };
    if (!group) {
      return {
        response: NextResponse.json(
          { message: 'Unknown class' },
          { status: 400 }
        ),
      };
    }
  }

  const locks = await readPages((from, to) => {
    const query = sbAdmin
      .from('fee_locks')
      .select('id, student_id, status, revision, currency, total_amount')
      .eq('ws_id', wsId)
      .eq('period_month', periodMonth);
    return (status === 'locked' ? query.eq('status', 'locked') : query)
      .order('id')
      .range(from, to);
  });
  if (locks.error) return { response: feeLockErrorResponse(locks.error) };
  let selected = locks.rows;

  if (groupId && selected.length) {
    const tagged = await readChunked(
      selected.map((lock) => lock.id),
      (ids, from, to) =>
        sbAdmin
          .from('fee_lock_lines')
          .select('id, fee_lock_id')
          .eq('ws_id', wsId)
          .eq('kind', 'tuition')
          .eq('group_id', groupId)
          .in('fee_lock_id', ids)
          .order('id')
          .range(from, to)
    );
    if (tagged.error) return { response: feeLockErrorResponse(tagged.error) };
    const inGroup = new Set(tagged.rows.map((line) => line.fee_lock_id));
    selected = selected.filter((lock) => inGroup.has(lock.id));
  }

  if (selected.length > FEE_LOCK_EXPORT_MAX_ROWS) {
    return {
      response: NextResponse.json(
        { code: FEE_LOCK_EXPORT_TOO_MANY_CODE, count: selected.length },
        { status: 400 }
      ),
    };
  }

  const entries = new Map<string, FeeLockExportEntry>();
  const locked = selected.filter((lock) => lock.status === 'locked');
  for (const revision of new Set(locked.map((lock) => lock.revision))) {
    const ids = locked.filter((l) => l.revision === revision).map((l) => l.id);
    const revisions = await readChunked(ids, (chunk, from, to) =>
      sbAdmin
        .from('fee_lock_revisions')
        .select('id, fee_lock_id, snapshot')
        .eq('ws_id', wsId)
        .eq('revision', revision)
        .in('fee_lock_id', chunk)
        .order('id')
        .range(from, to)
    );
    if (revisions.error)
      return { response: feeLockErrorResponse(revisions.error) };
    for (const row of revisions.rows) {
      const snapshot = feeLockSnapshotSchema.safeParse(row.snapshot);
      if (
        !snapshot.success ||
        snapshot.data.ws_id !== wsId ||
        snapshot.data.fee_lock_id !== row.fee_lock_id ||
        snapshot.data.revision !== revision
      ) {
        return { response: invalidSnapshot() };
      }
      entries.set(row.fee_lock_id, { ...snapshot.data, status: 'locked' });
    }
  }
  if (locked.some((lock) => !entries.has(lock.id)))
    return { response: invalidSnapshot() };

  const drafts = selected.filter((lock) => lock.status !== 'locked');
  if (drafts.length) {
    const draftIds = drafts.map((lock) => lock.id);
    const [lines, students] = await Promise.all([
      readChunked(draftIds, (ids, from, to) =>
        sbAdmin
          .from('fee_lock_lines')
          .select(
            'id, fee_lock_id, kind, group_id, group_name_snapshot, label, unit_label, unit_price, quantity, adjustment_amount, reason, line_amount, sort_order'
          )
          .eq('ws_id', wsId)
          .in('fee_lock_id', ids)
          .order('id')
          .range(from, to)
      ),
      readChunked(
        [...new Set(drafts.map((lock) => lock.student_id))],
        (ids, from, to) =>
          sbAdmin
            .from('workspace_users')
            .select('id, full_name, display_name')
            .eq('ws_id', wsId)
            .in('id', ids)
            .order('id')
            .range(from, to)
      ),
    ]);
    if (lines.error) return { response: feeLockErrorResponse(lines.error) };
    if (students.error)
      return { response: feeLockErrorResponse(students.error) };
    const names = new Map(
      students.rows.map((s) => [s.id, s.full_name ?? s.display_name ?? ''])
    );
    for (const lock of drafts) {
      entries.set(lock.id, {
        status: 'draft',
        revision: null,
        student_name: names.get(lock.student_id) ?? '',
        period_month: periodMonth,
        currency: lock.currency,
        total_amount: lock.total_amount,
        lines: lines.rows
          .filter((line) => line.fee_lock_id === lock.id)
          .map((line) => ({
            ...line,
            kind: line.kind as 'tuition' | 'extra',
            group_name: line.group_name_snapshot,
          })),
      });
    }
  }

  return {
    entries: [...entries.entries()].sort(
      ([idA, a], [idB, b]) =>
        a.student_name.localeCompare(b.student_name, 'vi') ||
        idA.localeCompare(idB)
    ),
  };
}
