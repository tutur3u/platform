import { MAX_COLOR_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { requireFinanceStatsAccess } from '../access';

const querySchema = z.object({
  date: z.string().max(MAX_COLOR_LENGTH),
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

    const access = await requireFinanceStatsAccess(req, wsId);
    if (access.response) return access.response;
    const { normalizedWsId, supabase } = access.context;

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
    serverLogger.error('Error fetching balance at date', { error });
    return NextResponse.json(
      { message: 'Internal server error while fetching balance' },
      { status: 500 }
    );
  }
}
