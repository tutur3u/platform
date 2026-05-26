import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  type FinanceRouteAuthContext,
  getFinanceRouteContext,
} from '../request-access';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { wsId } = await params;
  const access = await getFinanceRouteContext(req, wsId, authContext);

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, supabase } = access.context;
  const { withoutPermission } = permissions;

  // TODO: Migrate to another permission
  if (withoutPermission('manage_finance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const { data, error } = await supabase.rpc('get_transaction_count_by_tag', {
    _ws_id: normalizedWsId,
  });

  if (error) {
    return NextResponse.json(
      { message: 'Error fetching tags' },
      { status: 500 }
    );
  }

  const normalizedData = (data ?? []).map((tag) => ({
    id: tag.tag_id,
    name: tag.tag_name,
    color: tag.tag_color,
    description: tag.tag_description,
    ws_id: tag.ws_id,
    amount: Number(tag.total_amount ?? 0),
    transaction_count: Number(tag.transaction_count ?? 0),
    income_count: Number(tag.income_count ?? 0),
    expense_count: Number(tag.expense_count ?? 0),
    total_income: Number(tag.total_income ?? 0),
    total_expense: Number(tag.total_expense ?? 0),
    net_total: Number(tag.net_total ?? 0),
    recent_transaction_count: Number(tag.recent_transaction_count ?? 0),
    recent_income_count: Number(tag.recent_income_count ?? 0),
    recent_expense_count: Number(tag.recent_expense_count ?? 0),
    recent_total_income: Number(tag.recent_total_income ?? 0),
    recent_total_expense: Number(tag.recent_total_expense ?? 0),
    last_transaction_at: tag.last_transaction_at,
  }));

  return NextResponse.json(normalizedData);
}

const TagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .default('#3b82f6'),
  description: z.string().nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: Params,
  authContext?: FinanceRouteAuthContext
) {
  const { wsId } = await params;
  const access = await getFinanceRouteContext(req, wsId, authContext);

  if (access.response) {
    return access.response;
  }

  const { normalizedWsId, permissions, sbAdmin } = access.context;
  const { withoutPermission } = permissions;

  // TODO: Migrate to another permission
  if (withoutPermission('manage_finance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const parsed = TagSchema.safeParse(await req.json());

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request data', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { name, color, description } = parsed.data;

  const { data, error } = await sbAdmin
    .from('transaction_tags')
    .insert({
      ws_id: normalizedWsId,
      name,
      color,
      description: description || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { message: 'Error creating tag' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
