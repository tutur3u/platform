import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  date: z.string(),
  includeConfidential: z
    .enum(['true', 'false'])
    .optional()
    .default('true')
    .transform((v) => v === 'true'),
});

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(
  req: Request,
  { params }: Params
): Promise<NextResponse> {
  try {
    const { wsId } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);

    // Validate query parameters
    const parsed = querySchema.safeParse({
      date: searchParams.get('date'),
      includeConfidential: searchParams.get('includeConfidential'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query parameters. "date" is required.' },
        { status: 400 }
      );
    }

    const { date, includeConfidential } = parsed.data;

    // Normalize workspace ID (resolve special tokens like 'personal' to UUID)
    const normalizedWsId = await normalizeWorkspaceId(wsId);

    const { withoutPermission } = await getPermissions({
      wsId: normalizedWsId,
    });

    if (withoutPermission('view_finance_stats')) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // Get balance at the specified date
    const { data, error } = await supabase.rpc('get_wallet_balance_at_date', {
      _ws_id: normalizedWsId,
      _target_date: date,
      include_confidential: includeConfidential,
    });

    if (error) throw error;

    return NextResponse.json({
      balance: Number(data) || 0,
      date,
    });
  } catch (error) {
    console.error('Error fetching balance at date:', error);
    return NextResponse.json(
      { message: 'Internal server error while fetching balance' },
      { status: 500 }
    );
  }
}
