import { createClient } from '@tuturuuu/supabase/next/server';
import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';
import { z } from 'zod';

const querySchema = z.object({
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  includeConfidential: z
    .enum(['true', 'false'])
    .optional()
    .default('true')
    .transform((v) => v === 'true'),
  transactionType: z
    .enum(['expense', 'income', 'all'])
    .optional()
    .default('expense'),
  interval: z
    .enum(['daily', 'weekly', 'monthly', 'yearly'])
    .optional()
    .default('monthly'),
  anchorToLatest: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
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
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      includeConfidential: searchParams.get('includeConfidential'),
      transactionType: searchParams.get('transactionType'),
      interval: searchParams.get('interval'),
      anchorToLatest: searchParams.get('anchorToLatest'),
    });

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const {
      startDate,
      endDate,
      includeConfidential,
      transactionType,
      interval,
      anchorToLatest,
    } = parsed.data;

    // Normalize workspace ID (resolve special tokens like 'personal' to UUID)
    const normalizedWsId = await normalizeWorkspaceId(wsId);

    const { withoutPermission } = await getPermissions({
      wsId: normalizedWsId,
    });

    if (withoutPermission('view_finance_stats')) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    // Use the category breakdown RPC with interval support
    const { data, error } = await supabase.rpc('get_category_breakdown', {
      _ws_id: normalizedWsId,
      _start_date: startDate || undefined,
      _end_date: endDate || undefined,
      include_confidential: includeConfidential,
      _transaction_type: transactionType,
      _interval: interval,
      _anchor_to_latest: anchorToLatest,
    });

    if (error) throw error;

    return NextResponse.json({
      data: data || [],
    });
  } catch (error) {
    console.error('Error fetching category breakdown:', error);
    return NextResponse.json(
      { message: 'Internal server error while fetching category breakdown' },
      { status: 500 }
    );
  }
}
