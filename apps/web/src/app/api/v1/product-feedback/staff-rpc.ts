import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { StaffReadError } from './staff-access';
import type { StaffOperationContext } from './staff-operation';
import type { StaffQuery } from './staff-read';

type Functions = Database['public']['Functions'];
type List = Functions['list_product_feedback_staff'];
// Supabase typegen omits SQL argument nullability. These three arguments are
// explicitly nullable in the admitted list RPC; the other generated types stand.
export type FeedbackStaffDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Functions'> & {
    Functions: Omit<Functions, 'list_product_feedback_staff'> & {
      list_product_feedback_staff: Omit<List, 'Args'> & {
        Args: Omit<List['Args'], 'p_status' | 'p_before' | 'p_before_id'> & {
          p_status: string | null;
          p_before: string | null;
          p_before_id: string | null;
        };
      };
    };
  };
};
export function createFeedbackStaffStore(
  client: SupabaseClient<FeedbackStaffDatabase>
) {
  async function result(
    query: PromiseLike<{ data: unknown; error: { code: string } | null }>,
    operation: StaffOperationContext
  ) {
    operation.check();
    const { data, error } = await query;
    operation.check();
    if (error) throw new StaffReadError(error.code === 'PT403' ? 403 : 503);
    return data;
  }
  return {
    eligibility: (actor: string, operation: StaffOperationContext) =>
      result(
        client
          .rpc('check_product_feedback_staff_eligibility', { p_actor: actor })
          .abortSignal(operation.signal),
        operation
      ),
    list: (
      actor: string,
      query: StaffQuery,
      operation: StaffOperationContext
    ) =>
      result(
        client
          .rpc('list_product_feedback_staff', {
            p_actor: actor,
            p_view: query.view,
            p_status: query.status,
            p_query: query.q,
            p_limit: query.limit,
            p_before: query.before?.createdAt ?? null,
            p_before_id: query.before?.id ?? null,
          })
          .abortSignal(operation.signal),
        operation
      ),
    detail: (actor: string, id: string, operation: StaffOperationContext) =>
      result(
        client
          .rpc('get_product_feedback_staff', { p_actor: actor, p_id: id })
          .abortSignal(operation.signal),
        operation
      ),
  };
}
