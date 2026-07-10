import { MAX_COLOR_LENGTH } from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MAX_FINANCE_DAILY_DATE_RANGE_DAYS,
  MAX_FINANCE_EXTENDED_DATE_RANGE_DAYS,
  validateFinanceDateRange,
} from '../../date-range';
import { requireFinanceStatsAccess } from '../access';

const pointSchema = z.object({
  period: z.string(),
  total_expense: z.coerce.number().default(0),
  total_income: z.coerce.number().default(0),
});

const rpcResponseSchema = z.object({
  average_expense: z.coerce.number().default(0),
  average_income: z.coerce.number().default(0),
  closing_balance: z.coerce.number().default(0),
  data: z.array(pointSchema).default([]),
  net_total: z.coerce.number().default(0),
  opening_balance: z.coerce.number().default(0),
  total_expense: z.coerce.number().default(0),
  total_income: z.coerce.number().default(0),
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

type IncomeExpenseSummaryPrivateClient = {
  schema(schema: 'private'): {
    rpc(
      fn: 'get_income_expense_chart_summary',
      args: {
        _actor_id: string;
        _end_date?: string;
        _interval: 'daily' | 'monthly';
        _start_date?: string;
        _ws_id: string;
        include_confidential: boolean;
      }
    ): Promise<{
      data: unknown;
      error: { message?: string } | null;
    }>;
  };
};

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
    const dateRangeValidation = validateFinanceDateRange({
      endDate,
      maxDays:
        interval === 'daily'
          ? MAX_FINANCE_DAILY_DATE_RANGE_DAYS
          : MAX_FINANCE_EXTENDED_DATE_RANGE_DAYS,
      startDate,
    });

    if (!dateRangeValidation.ok) {
      return NextResponse.json(
        { message: dateRangeValidation.message },
        { status: 400 }
      );
    }

    const access = await requireFinanceStatsAccess(req, wsId);
    if (access.response) return access.response;
    const { normalizedWsId, sbAdmin, user } = access.context;

    const { data, error } = await (
      sbAdmin as unknown as IncomeExpenseSummaryPrivateClient
    )
      .schema('private')
      .rpc('get_income_expense_chart_summary', {
        _actor_id: user.id,
        _ws_id: normalizedWsId,
        _start_date: startDate || undefined,
        _end_date: endDate || undefined,
        include_confidential: includeConfidential,
        _interval: interval,
      });

    if (error) throw error;

    return NextResponse.json(rpcResponseSchema.parse(data ?? {}));
  } catch (error) {
    console.error('Error fetching income expense chart summary', {
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
