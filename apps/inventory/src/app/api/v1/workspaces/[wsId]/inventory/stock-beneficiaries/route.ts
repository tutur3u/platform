import type { InventoryStockBeneficiariesResponse } from '@tuturuuu/internal-api/inventory';
import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { canAdjustInventoryStock } from '@tuturuuu/inventory-core/permissions';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(100).default(''),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: requestedWsId } = await params;
  const parsedQuery = QuerySchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams)
  );
  if (!parsedQuery.success) {
    return NextResponse.json(
      { message: 'Invalid search parameters' },
      { status: 400 }
    );
  }

  const auth = await authorizeInventoryWorkspace(req, requestedWsId, {
    appSessionTargets: ['inventory'],
  });
  if (!auth.ok) return auth.response;
  const { permissions, wsId } = auth.value;
  if (!canAdjustInventoryStock(permissions)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  const sbAdmin = await createAdminClient();
  const { limit, q } = parsedQuery.data;
  let query = sbAdmin
    .from('workspace_users')
    .select('id, display_name, full_name, email')
    .eq('ws_id', wsId)
    .eq('archived', false)
    .order('display_name', { ascending: true, nullsFirst: false })
    .limit(limit);

  const safeSearch = q
    .replace(/[%,()._]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (safeSearch) {
    const pattern = `%${safeSearch}%`;
    query = query.or(
      `display_name.ilike.${pattern},full_name.ilike.${pattern},email.ilike.${pattern}`
    );
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching stock beneficiaries', error);
    return NextResponse.json(
      { message: 'Error fetching stock beneficiaries' },
      { status: 500 }
    );
  }

  const response: InventoryStockBeneficiariesResponse = {
    data: (data ?? []).map((person) => ({
      email: person.email,
      id: person.id,
      name: person.full_name ?? person.display_name,
    })),
  };
  return NextResponse.json(response);
}
