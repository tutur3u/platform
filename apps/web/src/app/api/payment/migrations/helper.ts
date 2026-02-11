import type { SupabaseClient } from '@tuturuuu/supabase';
import { createClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';

const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
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

export async function verifyAdminAccess() {
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

export function createNDJSONStream(
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

export async function upsertSubscriptionError(
  sbAdmin: SupabaseClient,
  wsId: string,
  errorMessage: string,
  errorSource: string
): Promise<{ error: string | null }> {
  const { error } = await sbAdmin.rpc('upsert_workspace_subscription_error', {
    _ws_id: wsId,
    _error_message: errorMessage,
    _error_source: errorSource,
  });

  if (error) {
    console.error(
      `Failed to log subscription error for workspace ${wsId}:`,
      error.message
    );
    return { error: error.message };
  }

  return { error: null };
}
