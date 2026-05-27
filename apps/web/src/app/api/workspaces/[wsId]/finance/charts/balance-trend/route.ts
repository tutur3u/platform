import { MAX_COLOR_LENGTH } from '@tuturuuu/utils/constants';
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
  maxPoints: z.coerce.number().int().min(1).max(366).optional().default(60),
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

    const parsed = querySchema.safeParse({
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      includeConfidential: searchParams.get('includeConfidential'),
      maxPoints: searchParams.get('maxPoints') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const { startDate, endDate, includeConfidential, maxPoints } = parsed.data;

    const access = await requireFinanceStatsAccess(req, wsId);
    if (access.response) return access.response;
    const { normalizedWsId, supabase } = access.context;

    const { data, error } = await supabase.rpc('get_balance_trend', {
      _ws_id: normalizedWsId,
      _start_date: startDate || undefined,
      _end_date: endDate || undefined,
      include_confidential: includeConfidential,
      _max_points: maxPoints,
    });

    if (error) throw error;

    return NextResponse.json({
      data: (data ?? []).map((point) => ({
        date: point.date,
        balance: Number(point.balance ?? 0),
      })),
    });
  } catch (error) {
    serverLogger.error('Error fetching balance trend data', { error });
    return NextResponse.json(
      { message: 'Internal server error while fetching balance trend data' },
      { status: 500 }
    );
  }
}
