import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

interface Params {
  params: Promise<{ wsId: string }>;
}

export async function GET(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const permissions = await getPermissions({
    wsId: normalizedWsId,
    request: req,
  });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const { withoutPermission } = permissions;

  // TODO: Migrate to another permission
  if (withoutPermission('manage_finance')) {
    return NextResponse.json(
      { message: 'Insufficient permissions' },
      { status: 403 }
    );
  }

  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('transaction_tags')
    .select(
      `
        id,
        name,
        color,
        description,
        ws_id,
        wallet_transaction_tags(
          transaction_id,
          wallet_transactions(amount, wallet_id)
        )
      `
    )
    .eq('ws_id', normalizedWsId)
    .order('name');

  if (error) {
    console.log(error);
    return NextResponse.json(
      { message: 'Error fetching tags' },
      { status: 500 }
    );
  }

  const normalizedData = (data ?? []).map((tag) => {
    const taggedTransactions = Array.isArray(tag.wallet_transaction_tags)
      ? tag.wallet_transaction_tags
      : [];
    let amount = 0;
    let transactionCount = 0;

    for (const taggedTransaction of taggedTransactions) {
      const walletTransaction = Array.isArray(
        taggedTransaction.wallet_transactions
      )
        ? taggedTransaction.wallet_transactions[0]
        : taggedTransaction.wallet_transactions;

      if (walletTransaction == null) {
        continue;
      }

      amount += Math.abs(Number(walletTransaction.amount ?? 0));
      transactionCount += 1;
    }

    return {
      id: tag.id,
      name: tag.name,
      color: tag.color,
      description: tag.description,
      ws_id: tag.ws_id,
      amount,
      transaction_count: transactionCount,
    };
  });

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

export async function POST(req: Request, { params }: Params) {
  const supabase = await createClient(req);
  const { wsId } = await params;
  const normalizedWsId = await normalizeWorkspaceId(wsId, supabase);
  const permissions = await getPermissions({
    wsId: normalizedWsId,
    request: req,
  });

  if (!permissions) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

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

  const sbAdmin = await createAdminClient();

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
    console.log(error);
    return NextResponse.json(
      { message: 'Error creating tag' },
      { status: 500 }
    );
  }

  return NextResponse.json(data);
}
