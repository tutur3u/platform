import {
  MAX_COLOR_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { requireFinanceStatsAccess } from '../access';

const querySchema = z.object({
  startDate: z.string().max(MAX_COLOR_LENGTH).optional().nullable(),
  endDate: z.string().max(MAX_COLOR_LENGTH).optional().nullable(),
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
  timezone: z.string().max(MAX_SHORT_TEXT_LENGTH).optional().default('UTC'),
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
    const { searchParams } = new URL(req.url);

    // Validate query parameters
    const parsed = querySchema.safeParse({
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      includeConfidential: searchParams.get('includeConfidential') ?? undefined,
      transactionType: searchParams.get('transactionType') ?? undefined,
      interval: searchParams.get('interval') ?? undefined,
      anchorToLatest: searchParams.get('anchorToLatest') ?? undefined,
      timezone: searchParams.get('timezone') ?? undefined,
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
      timezone,
    } = parsed.data;

    const access = await requireFinanceStatsAccess(req, wsId);
    if (access.response) return access.response;
    const { normalizedWsId, supabase } = access.context;

    // Use the category breakdown RPC with interval support
    const { data, error } = await supabase.rpc('get_category_breakdown', {
      _ws_id: normalizedWsId,
      _start_date: startDate || undefined,
      _end_date: endDate || undefined,
      include_confidential: includeConfidential,
      _transaction_type: transactionType,
      _interval: interval,
      _anchor_to_latest: anchorToLatest,
      _timezone: timezone,
    });

    if (error) throw error;

    return NextResponse.json({
      data: data || [],
    });
  } catch (error) {
    serverLogger.error('Error fetching category breakdown', { error });
    return NextResponse.json(
      { message: 'Internal server error while fetching category breakdown' },
      { status: 500 }
    );
  }
}
