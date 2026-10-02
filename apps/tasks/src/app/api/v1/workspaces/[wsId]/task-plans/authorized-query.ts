import type { TaskPlanRouteAuth } from './_utils';

const PAGE_SIZE = 500;
const ID_BATCH_SIZE = 100;

async function collectRows<T>(
  query: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: unknown }>
) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const result = await query(from, from + PAGE_SIZE - 1);
    if (result.error) throw result.error;
    rows.push(...(result.data ?? []));
    if ((result.data?.length ?? 0) < PAGE_SIZE) return rows;
  }
}

// App-session clients bypass RLS. Derive candidates only from actor-scoped
// ownership and share recipients, mirroring can_access_task_plan in SQL.
export async function getAccessibleTaskPlanIds(auth: TaskPlanRouteAuth) {
  const client = auth.sbAdmin;
  const [owned, memberships, actorEmail] = await Promise.all([
    collectRows((from, to) =>
      client
        .from('task_plans')
        .select('id')
        .eq('owner_id', auth.user.id)
        .order('id')
        .range(from, to)
    ),
    collectRows((from, to) =>
      client
        .from('workspace_members')
        .select('ws_id')
        .eq('user_id', auth.user.id)
        .eq('type', 'MEMBER')
        .order('ws_id')
        .range(from, to)
    ),
    client
      .from('user_private_details')
      .select('email')
      .eq('user_id', auth.user.id)
      .maybeSingle(),
  ]);
  if (actorEmail.error) throw actorEmail.error;
  const shares = [
    collectRows((from, to) =>
      client
        .from('task_plan_shares')
        .select('plan_id')
        .eq('shared_with_user_id', auth.user.id)
        .order('id')
        .range(from, to)
    ),
  ];
  const email = actorEmail.data?.email?.trim().toLowerCase();
  if (email)
    shares.push(
      collectRows((from, to) =>
        client
          .from('task_plan_shares')
          .select('plan_id')
          .eq('shared_with_email', email)
          .order('id')
          .range(from, to)
      )
    );
  const wsIds = memberships.map((row) => row.ws_id);
  // Bound URL size independently of PostgREST's response row cap.
  for (let index = 0; index < wsIds.length; index += ID_BATCH_SIZE) {
    shares.push(
      collectRows((from, to) =>
        client
          .from('task_plan_shares')
          .select('plan_id')
          .in('shared_with_ws_id', wsIds.slice(index, index + ID_BATCH_SIZE))
          .order('id')
          .range(from, to)
      )
    );
  }
  const results = await Promise.all(shares);
  return [
    ...new Set([
      ...owned.map((row) => row.id),
      ...results.flatMap((rows) => rows.map((row) => row.plan_id)),
    ]),
  ];
}
