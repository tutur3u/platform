import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { connection, NextResponse } from 'next/server';
import { authorizeInfrastructureMigrationExport } from '../migration-export-auth';

export async function GET(req: Request) {
  await connection();

  const { searchParams } = new URL(req.url);
  const rawWsId = searchParams.get('ws_id');
  const limit = String(
    Math.min(
      1000,
      Math.max(
        1,
        Number.parseInt(searchParams.get('limit') || '1000', 10) || 1000
      )
    )
  );
  const offset = String(
    Math.max(0, Number.parseInt(searchParams.get('offset') || '0', 10) || 0)
  );

  if (!rawWsId) {
    return NextResponse.json(
      { message: 'Missing ws_id parameter' },
      { status: 400 }
    );
  }

  const authorization = await authorizeInfrastructureMigrationExport(
    req,
    rawWsId
  );
  if (!authorization.ok) return authorization.response;
  const wsId = authorization.value.wsId;
  const supabase = await createAdminClient({ noCookie: true });

  const { data, error, count } = await supabase
    .from('finance_invoice_products')
    .select('*, finance_invoices!inner(ws_id)', { count: 'exact' })
    .eq('finance_invoices.ws_id', wsId)
    .range(
      Number.parseInt(offset, 10),
      Number.parseInt(offset, 10) + Number.parseInt(limit, 10) - 1
    );

  if (error) {
    console.error('Error fetching finance_invoice_products:', error);
    return NextResponse.json(
      { message: 'Error fetching finance_invoice_products' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: data || [],
    count: count || 0,
  });
}
