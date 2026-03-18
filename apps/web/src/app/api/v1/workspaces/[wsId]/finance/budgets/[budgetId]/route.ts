import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  budgetPayloadSchema,
  requireBudgetAccess,
  toBudgetMutationPayload,
} from '../shared';

interface Params {
  params: Promise<{
    wsId: string;
    budgetId: string;
  }>;
}

const budgetIdSchema = z.object({
  budgetId: z.uuid(),
});

export async function PATCH(request: Request, { params }: Params) {
  const resolvedParams = await params;
  const parsedBudgetId = budgetIdSchema.safeParse({
    budgetId: resolvedParams.budgetId,
  });

  if (!parsedBudgetId.success) {
    return NextResponse.json(
      { message: 'Invalid budget id', errors: parsedBudgetId.error.issues },
      { status: 400 }
    );
  }

  const access = await requireBudgetAccess(request, resolvedParams.wsId);
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
  const existing = await sbAdmin
    .from('finance_budgets')
    .select('id')
    .eq('ws_id', wsId)
    .eq('id', resolvedParams.budgetId)
    .maybeSingle();

  if (existing.error) {
    console.error('Error loading budget for update:', existing.error);
    return NextResponse.json(
      { message: 'Error updating budget' },
      { status: 500 }
    );
  }

  if (!existing.data) {
    return NextResponse.json({ message: 'Budget not found' }, { status: 404 });
  }

  const { data, error } = await sbAdmin
    .from('finance_budgets')
    .update({
      ...toBudgetMutationPayload(wsId, parsed.data),
      updated_at: new Date().toISOString(),
    })
    .eq('ws_id', wsId)
    .eq('id', resolvedParams.budgetId)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('Error updating budget:', error);
    return NextResponse.json(
      { message: 'Error updating budget' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ message: 'Budget not found' }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: Params) {
  const resolvedParams = await params;
  const parsedBudgetId = budgetIdSchema.safeParse({
    budgetId: resolvedParams.budgetId,
  });

  if (!parsedBudgetId.success) {
    return NextResponse.json(
      { message: 'Invalid budget id', errors: parsedBudgetId.error.issues },
      { status: 400 }
    );
  }

  const access = await requireBudgetAccess(request, resolvedParams.wsId);
  if ('error' in access) {
    return access.error;
  }

  const { sbAdmin, wsId } = access;
  const { data, error } = await sbAdmin
    .from('finance_budgets')
    .delete()
    .eq('ws_id', wsId)
    .eq('id', resolvedParams.budgetId)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error deleting budget:', error);
    return NextResponse.json(
      { message: 'Error deleting budget' },
      { status: 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ message: 'Budget not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
