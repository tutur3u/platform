import { getFinanceRouteContext } from '@tuturuuu/apis/finance/request-access';
import { resolveFinanceRouteAuthContext } from '@tuturuuu/finance-core/route-auth';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { currencySchema, externalProviderSchema } from '../lib';
import { privateFinanceDataClient } from '../private-client';

const payloadSchema = z.object({
  mappings: z
    .array(
      z.object({
        categoryId: z.guid().nullable().optional(),
        currency: currencySchema,
        provider: externalProviderSchema,
        walletId: z.guid().nullable().optional(),
      })
    )
    .max(100)
    .refine(
      (mappings) =>
        new Set(
          mappings.map((mapping) => `${mapping.provider}:${mapping.currency}`)
        ).size === mappings.length,
      { message: 'Duplicate provider and currency mapping' }
    ),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

async function getMappings(sbAdmin: TypedSupabaseClient, wsId: string) {
  const privateClient = privateFinanceDataClient(sbAdmin);
  const { data, error } = await privateClient
    .from<{
      category_id: string | null;
      currency: string;
      provider: string;
      wallet_id: string | null;
    }>('inventory_finance_provider_mappings')
    .select('provider, currency, wallet_id, category_id')
    .eq('ws_id', wsId)
    .order('provider')
    .order('currency');
  if (error) throw error;
  const walletIds = (data ?? [])
    .map((mapping) => mapping.wallet_id)
    .filter((id): id is string => Boolean(id));
  const categoryIds = (data ?? [])
    .map((mapping) => mapping.category_id)
    .filter((id): id is string => Boolean(id));
  const [{ data: wallets }, { data: categories }] = await Promise.all([
    walletIds.length
      ? privateClient
          .from<{ id: string; name: string | null }>('workspace_wallets')
          .select('id, name')
          .in('id', walletIds)
      : Promise.resolve({ data: [] }),
    categoryIds.length
      ? sbAdmin
          .from('transaction_categories')
          .select('id, name')
          .in('id', categoryIds)
      : Promise.resolve({ data: [] }),
  ]);
  const walletById = new Map(
    (wallets ?? []).map((wallet) => [wallet.id, wallet])
  );
  const categoryById = new Map(
    (categories ?? []).map((category) => [category.id, category])
  );
  return (data ?? []).map((mapping) => ({
    category: mapping.category_id
      ? (categoryById.get(mapping.category_id) ?? null)
      : null,
    categoryId: mapping.category_id,
    currency: mapping.currency,
    provider: mapping.provider,
    wallet: mapping.wallet_id
      ? (walletById.get(mapping.wallet_id) ?? null)
      : null,
    walletId: mapping.wallet_id,
  }));
}

async function authorize(request: Request, wsId: string) {
  const access = await getFinanceRouteContext(
    request,
    wsId,
    await resolveFinanceRouteAuthContext(request)
  );
  if (access.response) return access;
  if (access.context.permissions.withoutPermission('manage_finance')) {
    return {
      response: NextResponse.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    };
  }
  return access;
}

export async function GET(request: Request, { params }: Params) {
  await connection();
  try {
    const { wsId } = await params;
    const access = await authorize(request, wsId);
    if (access.response) return access.response;
    return NextResponse.json({
      mappings: await getMappings(
        access.context.sbAdmin,
        access.context.normalizedWsId
      ),
    });
  } catch (error) {
    console.error('Inventory Finance mapping list failed', error);
    return NextResponse.json(
      { message: 'Failed to load provider mappings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request, { params }: Params) {
  try {
    const payload = payloadSchema.safeParse(await request.json());
    if (!payload.success) {
      return NextResponse.json(
        { message: 'Invalid provider mappings' },
        { status: 400 }
      );
    }
    const { wsId } = await params;
    const access = await authorize(request, wsId);
    if (access.response) return access.response;
    const { normalizedWsId, sbAdmin, user } = access.context;
    if (payload.data.mappings.length) {
      const { error } = await privateFinanceDataClient(sbAdmin)
        .from('inventory_finance_provider_mappings')
        .upsert(
          payload.data.mappings.map((mapping) => ({
            category_id: mapping.categoryId ?? null,
            created_by: user.id,
            currency: mapping.currency,
            provider: mapping.provider,
            updated_by: user.id,
            wallet_id: mapping.walletId ?? null,
            ws_id: normalizedWsId,
          })),
          { onConflict: 'ws_id,provider,currency' }
        );
      if (error) throw error;
    }
    return NextResponse.json({
      mappings: await getMappings(sbAdmin, normalizedWsId),
    });
  } catch (error) {
    console.error('Inventory Finance mapping update failed', error);
    return NextResponse.json(
      { message: 'Failed to update provider mappings' },
      { status: 500 }
    );
  }
}
