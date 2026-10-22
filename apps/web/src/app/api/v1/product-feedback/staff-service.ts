import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { createStaffEligibilityHandler } from './eligibility/handler';
import { resolveStaffActor } from './staff-access';
import { createStaffAuthTransport } from './staff-auth-transport';
import {
  openStaffOperation,
  type StaffOperationContext,
  type StaffOperationPolicy,
} from './staff-operation';
import {
  createStaffDetailHandler,
  createStaffListHandler,
  type StaffReadDependencies,
} from './staff-read';
import {
  createFeedbackStaffStore,
  type FeedbackStaffDatabase,
} from './staff-rpc';

export const feedbackStaffPolicy: StaffOperationPolicy = {
  durationMs: 10000,
  scope: 'staff-list-detail-handler',
  provenance:
    'Web feedback staff HTTP admission: 10s total, SQL statement 3s/lock 500ms; no retries',
};
export function createFeedbackStaffService(
  deps: StaffReadDependencies & {
    eligibility(
      actor: string,
      operation: StaffOperationContext
    ): Promise<unknown>;
  },
  policy = feedbackStaffPolicy
) {
  const list = createStaffListHandler(deps, policy);
  const detail = createStaffDetailHandler(deps, policy);
  async function identity(request: Request) {
    const operation = openStaffOperation(request, policy);
    const unavailable = () =>
      Response.json(
        { error: { code: 'feedback_unavailable' } },
        {
          status: 503,
          headers: {
            'Cache-Control': 'private, no-store',
            Vary: 'Authorization, Cookie',
          },
        }
      );
    if (!operation) return { actor: null, response: unavailable() };
    let actor: string | null = null;
    const handler = createStaffEligibilityHandler({
      resolveActor: async (req) => {
        actor = await deps.actor(req, operation);
        return actor;
      },
      enabled: deps.enabled,
      check: (id) => deps.eligibility(id, operation),
    });
    const response = await operation.run(
      operation.phase(() => handler(request)),
      (value) => value,
      unavailable
    );
    return { actor: response.status === 200 ? actor : null, response };
  }
  return {
    list,
    detail,
    identity,
    eligibility: async (request: Request) => (await identity(request)).response,
  };
}
async function store(operation: StaffOperationContext) {
  operation.check();
  const client = await createAdminClient<FeedbackStaffDatabase>({
    noCookie: true,
    fetch: createStaffAuthTransport(operation),
  });
  operation.check();
  return createFeedbackStaffStore(client);
}
export const feedbackStaffService = createFeedbackStaffService({
  actor: resolveStaffActor,
  enabled: () => process.env.PRODUCT_FEEDBACK_STAFF_INBOX_ENABLED === 'true',
  eligibility: async (actor, operation) =>
    (await store(operation)).eligibility(actor, operation),
  list: async (actor, query, operation) =>
    (await store(operation)).list(actor, query, operation),
  detail: async (actor, id, operation) =>
    (await store(operation)).detail(actor, id, operation),
});
