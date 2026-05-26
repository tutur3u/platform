import { MAX_COLOR_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { serverLogger } from '@/lib/infrastructure/log-drain';
import { requireFinanceStatsAccess } from '../access';

const pointSchema = z.object({
  period: z.string(),
  total_expense: z.coerce.number().default(0),
  total_income: z.coerce.number().default(0),
});

const rpcResponseSchema = z.object({
  closing_balance: z.coerce.number().default(0),
  data: z.array(pointSchema).default([]),
  opening_balance: z.coerce.number().default(0),
});

const querySchema = z.object({
  startDate: z.string().max(MAX_COLOR_LENGTH).optional().nullable(),
  endDate: z.string().max(MAX_COLOR_LENGTH).optional().nullable(),
  includeConfidential: z
    .enum(['true', 'false'])
    .optional()
    .default('true')
    .transform((v) => v === 'true'),
  interval: z.enum(['daily', 'monthly']).default('daily'),
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
      interval: searchParams.get('interval') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid query parameters' },
        { status: 400 }
      );
    }

    const { startDate, endDate, includeConfidential, interval } = parsed.data;

    const access = await requireFinanceStatsAccess(req, wsId);
    if (access.response) return access.response;
    const { normalizedWsId, supabase } = access.context;

    const { data, error } = await supabase.rpc(
      'get_income_expense_chart_summary',
      {
        _ws_id: normalizedWsId,
        _start_date: startDate || undefined,
        _end_date: endDate || undefined,
        include_confidential: includeConfidential,
        _interval: interval,
      }
    );

    if (error) throw error;

    return NextResponse.json(rpcResponseSchema.parse(data ?? {}));
  } catch (error) {
    serverLogger.error('Error fetching income expense chart summary', {
      error,
    });
    return NextResponse.json(
      {
        message:
          'Internal server error while fetching income expense chart summary',
      },
      { status: 500 }
    );
  }
}
