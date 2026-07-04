import { NextResponse } from 'next/server';
import {
  budgetPayloadSchema,
  requireBudgetAccess,
  toBudgetMutationPayload,
} from './shared';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(request: Request, { params }: Params) {
  const access = await requireBudgetAccess(request, (await params).wsId);
  if ('error' in access) {
    return access.error;
  }

  const { sbAdmin, wsId } = access;
  const { data, error } = await sbAdmin
    .from('finance_budgets')
    .select('*')
    .eq('ws_id', wsId)
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching budgets:', error);
    return NextResponse.json(
      { message: 'Error fetching budgets' },
      { status: 500 }
    );
  }

  return NextResponse.json(data ?? []);
}

export async function POST(request: Request, { params }: Params) {
  const access = await requireBudgetAccess(request, (await params).wsId);
  if ('error' in access) {
    return access.error;
  }

  const parsed = budgetPayloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid request data', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { sbAdmin, wsId } = access;
  const { data, error } = await sbAdmin
    .from('finance_budgets')
    .insert(toBudgetMutationPayload(wsId, parsed.data))
    .select('*')
    .single();

  if (error) {
    console.error('Error creating budget:', error);
    return NextResponse.json(
      { message: 'Error creating budget' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
