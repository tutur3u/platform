import {
  MAX_COLOR_LENGTH,
  MAX_SHORT_TEXT_LENGTH,
} from '@tuturuuu/utils/constants';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  MAX_FINANCE_DAILY_DATE_RANGE_DAYS,
  MAX_FINANCE_EXTENDED_DATE_RANGE_DAYS,
  validateFinanceDateRange,
} from '../../date-range';
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

type CategoryBreakdownPrivateClient = {
  schema(schema: 'private'): {
    rpc(
      fn: 'get_category_breakdown',
      args: {
        _actor_id: string;
        _anchor_to_latest: boolean;
        _end_date?: string;
        _interval: 'daily' | 'weekly' | 'monthly' | 'yearly';
        _start_date?: string;
        _timezone: string;
        _transaction_type: 'expense' | 'income' | 'all';
        _ws_id: string;
        include_confidential: boolean;
      }
    ): Promise<{
      data:
        | {
            category_color?: string | null;
            category_icon?: string | null;
            category_id?: string | null;
            category_name?: string | null;
            period?: string | null;
            total?: number | string | null;
          }[]
        | null;
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
      sbAdmin as unknown as CategoryBreakdownPrivateClient
    )
      .schema('private')
      .rpc('get_category_breakdown', {
        _actor_id: user.id,
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
    console.error('Error fetching category breakdown', { error });
    return NextResponse.json(
      { message: 'Internal server error while fetching category breakdown' },
      { status: 500 }
    );
  }
}
