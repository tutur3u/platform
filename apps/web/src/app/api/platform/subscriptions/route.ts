import { createPolarClient } from '@tuturuuu/payment/polar/server';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { getOrCreatePolarCustomer } from '@/utils/customer-helper';
import { createFreeSubscription } from '@/utils/subscription-helper';

const PAGE_SIZE = 1000;

async function fetchAllRows<T>(
  queryFn: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<{ data: T[]; error: unknown }> {
  const allRows: T[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await queryFn(offset, offset + PAGE_SIZE - 1);

    if (error) return { data: allRows, error };
    if (!data || data.length === 0) break;

    allRows.push(...data);

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return { data: allRows, error: null };
}

async function verifyAdminAccess() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 };

  const { data: hasPermission, error: permissionError } = await supabase.rpc(
    'has_workspace_permission',
    {
      p_user_id: user.id,
      p_ws_id: ROOT_WORKSPACE_ID,
      p_permission: 'manage_workspace_roles',
    }
  );

  if (permissionError || !hasPermission) {
    return { error: 'Unauthorized: Admin access required', status: 403 };
  }

  return { error: null, status: 200 };
}

function createNDJSONStream(
  processFn: (send: (data: Record<string, unknown>) => void) => Promise<void>
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(data)}\n`));
      };

      try {
        await processFn(send);
      } catch (err) {
        send({
          type: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
    },
  });
}

export async function POST() {
  const auth = await verifyAdminAccess();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sbAdmin = await createAdminClient();
  const polar = createPolarClient();

  const { data: workspaces, error: wsError } = await fetchAllRows((from, to) =>
    sbAdmin
      .from('workspaces')
      .select('id, workspace_subscriptions!left(id, status)')
      .range(from, to)
  );

  if (wsError) {
    return NextResponse.json(
      { error: 'Failed to fetch workspaces' },
      { status: 500 }
    );
  }

  return createNDJSONStream(async (send) => {
    const total = workspaces.length;
    let created = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: Array<{ id: string; error: string }> = [];
    const startTime = Date.now();

    send({ type: 'start', total });

    for (let i = 0; i < workspaces.length; i++) {
      const workspace = workspaces[i]!;

      try {
        if (
          workspace.workspace_subscriptions.some(
            (sub) => sub.status === 'active'
          )
        ) {
          skipped++;
        } else {
          await getOrCreatePolarCustomer({
            polar,
            supabase: sbAdmin,
            wsId: workspace.id,
          });

          const subscription = await createFreeSubscription(
            polar,
            sbAdmin,
            workspace.id
          );

          if (!subscription) {
            errors++;
            errorDetails.push({
              id: workspace.id,
              error: 'Failed to create free subscription',
            });
          } else {
            created++;
          }
        }
      } catch (err) {
        errors++;
        errorDetails.push({
          id: workspace.id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }

      send({
        type: 'progress',
        current: i + 1,
        total,
        created,
        skipped,
        errors,
      });
    }

    send({
      type: 'complete',
      total,
      created,
      skipped,
      errors,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      duration: Date.now() - startTime,
      message: `${total} workspaces found, ${created} created, ${skipped} skipped, ${errors} errors`,
    });
  });
}

export async function DELETE() {
  const auth = await verifyAdminAccess();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sbAdmin = await createAdminClient();

  const { data: subscriptions, error: subError } = await fetchAllRows(
    (from, to) =>
      sbAdmin
        .from('workspace_subscriptions')
        .select('*')
        .eq('status', 'active')
        .range(from, to)
  );

  if (subError) {
    return NextResponse.json(
      {
        error: `Failed to fetch subscriptions: ${subError instanceof Error ? subError.message : String(subError)}`,
      },
      { status: 500 }
    );
  }

  return createNDJSONStream(async (send) => {
    const total = subscriptions.length;
    let processed = 0;
    let errors = 0;
    const errorDetails: Array<{ id: string; error: string }> = [];
    const startTime = Date.now();
    const polar = createPolarClient();

    send({ type: 'start', total });

    for (let i = 0; i < subscriptions.length; i++) {
      const sub = subscriptions[i]!;

      try {
        await polar.subscriptions.revoke({
          id: sub.polar_subscription_id,
        });
        processed++;
      } catch (err) {
        errors++;
        errorDetails.push({
          id: sub.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      send({
        type: 'progress',
        current: i + 1,
        total,
        processed,
        errors,
      });
    }

    send({
      type: 'complete',
      total,
      processed,
      errors,
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
      duration: Date.now() - startTime,
      message: `${total} subscriptions found, ${processed} revoked, ${errors} errors`,
    });
  });
}
