import { isPolarSubscriptionEnded } from '@tuturuuu/payment/polar/errors';
import { createPolarClient } from '@tuturuuu/payment/polar/server';
import { WORKSPACE_DELETION_REVOKE_COMMENT } from '@tuturuuu/payment-core/subscription-constants';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

type AdminClient = TypedSupabaseClient;

export type WorkspaceDeletionEligibility =
  | 'ready'
  | 'protected'
  | 'subscription_active'
  | 'failed';

type PolarSubscriptions = {
  subscriptions: {
    get(request: { id: string }): Promise<{ amount: number; status: string }>;
    update(request: {
      id: string;
      subscriptionUpdate: {
        revoke: true;
        customerCancellationComment: string;
      };
    }): Promise<unknown>;
  };
};

/**
 * Reads the protection flag and billing guard that decide whether an owner
 * may delete the workspace. Paid or unverified billing blocks deletion; the
 * owner cancels it in Billing first, so deletion never ends a paid period.
 */
export async function readWorkspaceDeletionEligibility(
  admin: AdminClient,
  workspaceId: string
): Promise<WorkspaceDeletionEligibility> {
  const [secrets, billing] = await Promise.all([
    admin
      .from('workspace_secrets')
      .select('value')
      .eq('ws_id', workspaceId)
      .eq('name', 'PREVENT_WORKSPACE_DELETION'),
    admin.schema('private').rpc('workspace_has_blocking_subscription', {
      p_ws_id: workspaceId,
    }),
  ]);
  if (secrets.error || billing.error || billing.data === null) {
    console.error('Workspace deletion status lookup failed', {
      code: secrets.error?.code ?? billing.error?.code,
    });
    return 'failed';
  }
  if (
    (secrets.data ?? []).some(
      (secret) => secret.value?.trim().toLowerCase() === 'true'
    )
  ) {
    return 'protected';
  }
  return billing.data ? 'subscription_active' : 'ready';
}

function billingAudit(
  actorId: string,
  workspaceId: string,
  subscriptionId: string,
  outcome: 'revoked' | 'already_ended' | 'failed'
) {
  console.info('[audit] workspace.billing.revoke', {
    action: 'workspace.billing.revoke',
    actorId,
    workspaceId,
    subscriptionId,
    outcome,
    trigger: 'workspace.delete',
  });
}

const ENDED_STATUSES = new Set(['canceled', 'incomplete_expired']);

type LiveSubscription = { id: string; productId: string | null };

function isFreeProduct(
  product: { pricing_model: string | null; price: number | null } | undefined
) {
  return (
    product?.pricing_model === 'free' ||
    (product?.pricing_model === 'fixed' && product.price === 0)
  );
}

/** Reads the workspace's live Polar subscriptions; any paid one blocks. */
async function readRevocableSubscriptions(
  admin: AdminClient,
  workspaceId: string
): Promise<LiveSubscription[] | 'failed' | 'subscription_active'> {
  const { data, error } = await admin
    .from('workspace_subscriptions')
    .select('polar_subscription_id, product_id')
    .eq('ws_id', workspaceId)
    .neq('status', 'canceled');
  if (error) {
    console.error('Workspace deletion subscription lookup failed', {
      code: error.code,
    });
    return 'failed';
  }
  const live: LiveSubscription[] = [];
  for (const row of data ?? []) {
    const id: unknown = row.polar_subscription_id;
    const productId: unknown = row.product_id;
    if (typeof id !== 'string' || !id || live.some((sub) => sub.id === id)) {
      continue;
    }
    live.push({
      id,
      productId: typeof productId === 'string' ? productId : null,
    });
  }
  if (live.length === 0) return live;

  const productIds = live.flatMap((sub) =>
    sub.productId ? [sub.productId] : []
  );
  const products = await admin
    .schema('private')
    .from('workspace_subscription_products')
    .select('id, pricing_model, price')
    .in('id', productIds);
  if (products.error) {
    console.error('Workspace deletion product lookup failed', {
      code: products.error.code,
    });
    return 'failed';
  }
  const byId = new Map<
    string,
    { pricing_model: string | null; price: number | null }
  >();
  for (const product of products.data ?? []) byId.set(product.id, product);
  // Matches private.workspace_has_blocking_subscription: an unknown product
  // counts as paid, so a plan that changed since the eligibility check is kept.
  return live.every((sub) => isFreeProduct(byId.get(sub.productId ?? '')))
    ? live
    : 'subscription_active';
}

/**
 * Ends every remaining Polar subscription of a workspace that is about to be
 * deleted. Only free or zero-price subscriptions are revoked: each one is
 * re-checked against the product catalog and against Polar's current amount,
 * so a plan upgraded after the eligibility check is kept. Revocation is
 * immediate, issues no refund, and treats an already-ended subscription as
 * done, so a retry is safe. The cancellation comment tells the Pay webhook not
 * to provision a replacement free plan.
 */
export async function revokeWorkspaceSubscriptionsForDeletion(
  {
    admin,
    actorId,
    workspaceId,
  }: { admin: AdminClient; actorId: string; workspaceId: string },
  polarFactory: () => PolarSubscriptions = createPolarClient
): Promise<
  'revoked' | 'failed' | 'subscription_active' | 'billing_cancel_failed'
> {
  const live = await readRevocableSubscriptions(admin, workspaceId);
  if (!Array.isArray(live)) return live;
  if (live.length === 0) return 'revoked';

  let polar: PolarSubscriptions;
  try {
    polar = polarFactory();
  } catch (polarError) {
    console.error('Polar client unavailable for workspace deletion', {
      name: polarError instanceof Error ? polarError.name : 'unknown',
    });
    for (const sub of live)
      billingAudit(actorId, workspaceId, sub.id, 'failed');
    return 'billing_cancel_failed';
  }

  const fail = (id: string, step: string, cause: unknown) => {
    console.error('Polar subscription revoke failed', {
      step,
      name: cause instanceof Error ? cause.name : 'unknown',
    });
    billingAudit(actorId, workspaceId, id, 'failed');
    return 'billing_cancel_failed' as const;
  };

  // Polar has no conditional revoke, so each subscription is read twice: once
  // for all of them before any revocation, and again just before its own
  // revocation. A malformed amount counts as paid.
  const readState = async (id: string) => {
    try {
      const current = await polar.subscriptions.get({ id });
      if (ENDED_STATUSES.has(current.status)) return 'ended' as const;
      return Number.isFinite(current.amount) && current.amount === 0
        ? ('free' as const)
        : ('paid' as const);
    } catch (getError) {
      if (isPolarSubscriptionEnded(getError)) return 'ended' as const;
      return fail(id, 'get', getError);
    }
  };

  for (const { id } of live) {
    const state = await readState(id);
    if (state === 'paid') return 'subscription_active';
    if (state === 'billing_cancel_failed') return state;
  }

  const revoked: string[] = [];
  const outcome = await (async () => {
    for (const { id } of live) {
      const state = await readState(id);
      if (state === 'paid') return 'subscription_active' as const;
      if (state === 'billing_cancel_failed') return state;
      if (state === 'ended') {
        billingAudit(actorId, workspaceId, id, 'already_ended');
        revoked.push(id);
        continue;
      }
      try {
        await polar.subscriptions.update({
          id,
          subscriptionUpdate: {
            revoke: true,
            customerCancellationComment: WORKSPACE_DELETION_REVOKE_COMMENT,
          },
        });
        billingAudit(actorId, workspaceId, id, 'revoked');
      } catch (revokeError) {
        if (!isPolarSubscriptionEnded(revokeError)) {
          return fail(id, 'revoke', revokeError);
        }
        billingAudit(actorId, workspaceId, id, 'already_ended');
      }
      revoked.push(id);
    }
    return 'revoked' as const;
  })();

  // Keep the local projection truthful whether or not deletion continues: a
  // surviving workspace then gets a new free plan on its next dashboard visit.
  if (revoked.length > 0) {
    const { error: statusError } = await admin
      .from('workspace_subscriptions')
      .update({ status: 'canceled' })
      .eq('ws_id', workspaceId)
      .in('polar_subscription_id', revoked);
    if (statusError) {
      console.error('Workspace deletion subscription status update failed', {
        code: statusError.code,
      });
    }
  }
  return outcome;
}
