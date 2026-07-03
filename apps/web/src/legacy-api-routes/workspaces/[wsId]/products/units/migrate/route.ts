import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { ProductCategory } from '@tuturuuu/types/primitives/ProductCategory';
import { NextResponse } from 'next/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function PUT(req: Request, { params }: Params) {
  const inventory = (await createAdminClient()).schema('private');
  const data = await req.json();
  const { wsId } = await params;

  const { error } = await inventory
    .from('inventory_units')
    .upsert(
      (data?.units || []).map((c: ProductCategory) => ({
        ...c,
        ws_id: wsId,
      }))
    )
    .eq('id', data.id);

  if (error) {
    serverLogger.error('Error migrating product units', error);
    return NextResponse.json(
      { message: 'Error migrating product units' },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: 'success' });
}
