import { hashApiKey } from '@tuturuuu/auth/api-keys';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateSepayEndpointToken } from '@/lib/sepay';
import { isSepayIntegrationEnabled } from './feature-flag';

export const sepayEndpointBodySchema = z.object({
  active: z.boolean().optional(),
  sepayWebhookId: z.string().trim().max(255).nullable().optional(),
  walletId: z.guid().nullable().optional(),
});

export const endpointIdSchema = z.object({
  id: z.guid(),
});

type SepayAdminClient = TypedSupabaseClient;

export type SepayAccessContext = {
  sbAdmin: SepayAdminClient;
  wsId: string;
};

export async function requireSepayAccess(
  request: Request,
  rawWsId: string
): Promise<SepayAccessContext | { error: NextResponse }> {
  const supabase = await createClient(request);

  const { user: authUser, authError } =
    await resolveAuthenticatedSessionUser(supabase);
  if (authError) {
    console.error('Failed to authenticate SePay access request:', authError);
    return {
      error: NextResponse.json(
        { message: 'Failed to authenticate request' },
        { status: 401 }
      ),
    };
  }

  if (!authUser) {
    return {
      error: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  let wsId: string;
  try {
    wsId = await normalizeWorkspaceId(rawWsId, supabase);
  } catch (error) {
    console.error('Failed to normalize SePay workspace id:', error);
    return {
      error: NextResponse.json(
        { message: 'Failed to resolve workspace' },
        { status: 500 }
      ),
    };
  }

  const permissions = await getPermissions({ wsId, request });
  if (!permissions) {
    return {
      error: NextResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    };
  }

  if (permissions.withoutPermission('manage_finance')) {
    return {
      error: NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    };
  }

  return {
    wsId,
    sbAdmin: (await createAdminClient()) as SepayAdminClient,
  };
}

export async function requireSepayFeatureEnabled(input: {
  sbAdmin: SepayAdminClient;
  wsId: string;
}) {
  try {
    const enabled = await isSepayIntegrationEnabled({
      sbAdmin: input.sbAdmin,
      wsId: input.wsId,
    });

    if (enabled) {
      return null;
    }

    return NextResponse.json(
      { message: 'SePay integration is disabled for this workspace' },
      { status: 403 }
    );
  } catch (error) {
    console.error('Failed to resolve SePay integration feature flag:', error);
    return NextResponse.json(
      { message: 'Failed to resolve SePay integration availability' },
      { status: 500 }
    );
  }
}

export async function createSepayEndpointTokenRow(input: {
  active?: boolean;
  sbAdmin: SepayAdminClient;
  sepayWebhookId?: string | null;
  walletId?: string | null;
  wsId: string;
}) {
  const { token, prefix } = generateSepayEndpointToken();
  const tokenHash = await hashApiKey(token);

  const insertPayload = {
    active: input.active ?? true,
    sepay_webhook_id: input.sepayWebhookId ?? null,
    token_hash: tokenHash,
    token_prefix: prefix,
    wallet_id: input.walletId ?? null,
    ws_id: input.wsId,
  };

  const { data, error } = await input.sbAdmin
    .from('sepay_webhook_endpoints')
    .insert(insertPayload)
    .select(
      'id, ws_id, wallet_id, token_prefix, active, sepay_webhook_id, created_at, rotated_at, last_used_at'
    )
    .single();

  return { data, error, token };
}

export async function ensureWalletBelongsToWorkspace(input: {
  sbAdmin: SepayAdminClient;
  walletId: string;
  wsId: string;
}) {
  const { data, error } = await input.sbAdmin
    .from('workspace_wallets')
    .select('id')
    .eq('id', input.walletId)
    .eq('ws_id', input.wsId)
    .maybeSingle();

  if (error) {
    return { ok: false as const, status: 500 as const };
  }

  if (!data) {
    return { ok: false as const, status: 400 as const };
  }

  return { ok: true as const };
}
