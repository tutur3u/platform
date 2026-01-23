import {
  getPermissions,
  normalizeWorkspaceId,
} from '@tuturuuu/utils/workspace-helper';
import { NextResponse } from 'next/server';

import { parseAnalyticsQuery } from './analytics-query';
import {
  getDailyInvoiceTotals,
  getDailyInvoiceTotalsByCreator,
  getInvoiceTotalsByDateRange,
  getMonthlyInvoiceTotals,
  getMonthlyInvoiceTotalsByCreator,
  getWeeklyInvoiceTotals,
  getWeeklyInvoiceTotalsByCreator,
} from './analytics-rpc';
import type { IntervalType } from './analytics-types';

interface Params {
  params: Promise<{
    wsId: string;
  }>;
}

export async function GET(req: Request, { params }: Params) {
  const { wsId: id } = await params;
  const wsId = await normalizeWorkspaceId(id);

  // Check permissions
  const { withoutPermission } = await getPermissions({ wsId });
  if (withoutPermission('view_invoices')) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 403 });
  }

  // Parse query parameters
  const { searchParams } = new URL(req.url);
  const parsedParams = parseAnalyticsQuery(searchParams);

  if (!parsedParams.success) {
    return NextResponse.json(
      {
        message: 'Invalid query parameters',
        issues: parsedParams.error.format(),
      },
      { status: 400 }
    );
  }

  const { walletIds, userIds, start, end, granularity, weekStartsOn } =
    parsedParams.data;

  try {
    const hasDateRange = !!(start && end);

    const intervalType: IntervalType | undefined = granularity
      ? granularity === 'daily'
        ? 'day'
        : granularity === 'weekly'
          ? 'week'
          : 'month'
      : undefined;

    if (hasDateRange) {
      // Fetch data grouped by wallet and by creator for the date range
      const [walletData, creatorData] = await Promise.all([
        getInvoiceTotalsByDateRange(wsId, {
          walletIds: walletIds.length > 0 ? walletIds : undefined,
          userIds: userIds.length > 0 ? userIds : undefined,
          startDate: start!,
          endDate: end!,
          groupByCreator: false,
          weekStartsOn,
          intervalType,
        }),
        getInvoiceTotalsByDateRange(wsId, {
          walletIds: walletIds.length > 0 ? walletIds : undefined,
          userIds: userIds.length > 0 ? userIds : undefined,
          startDate: start!,
          endDate: end!,
          groupByCreator: true,
          weekStartsOn,
          intervalType,
        }),
      ]);

      return NextResponse.json({
        walletData,
        creatorData,
        hasDateRange: true,
        startDate: start,
        endDate: end,
      });
    }

    // No date range: fetch all periods for both wallet and creator grouping
    const [
      dailyWalletData,
      weeklyWalletData,
      monthlyWalletData,
      dailyCreatorData,
      weeklyCreatorData,
      monthlyCreatorData,
    ] = await Promise.all([
      getDailyInvoiceTotals(
        wsId,
        walletIds.length > 0 ? walletIds : undefined,
        userIds.length > 0 ? userIds : undefined
      ),
      getWeeklyInvoiceTotals(
        wsId,
        walletIds.length > 0 ? walletIds : undefined,
        userIds.length > 0 ? userIds : undefined,
        weekStartsOn
      ),
      getMonthlyInvoiceTotals(
        wsId,
        walletIds.length > 0 ? walletIds : undefined,
        userIds.length > 0 ? userIds : undefined
      ),
      getDailyInvoiceTotalsByCreator(
        wsId,
        walletIds.length > 0 ? walletIds : undefined,
        userIds.length > 0 ? userIds : undefined,
        weekStartsOn
      ),
      getWeeklyInvoiceTotalsByCreator(
        wsId,
        walletIds.length > 0 ? walletIds : undefined,
        userIds.length > 0 ? userIds : undefined,
        weekStartsOn
      ),
      getMonthlyInvoiceTotalsByCreator(
        wsId,
        walletIds.length > 0 ? walletIds : undefined,
        userIds.length > 0 ? userIds : undefined
      ),
    ]);

    return NextResponse.json({
      dailyWalletData,
      weeklyWalletData,
      monthlyWalletData,
      dailyCreatorData,
      weeklyCreatorData,
      monthlyCreatorData,
      hasDateRange: false,
    });
  } catch (error) {
    console.error('Error fetching invoice analytics:', error);
    return NextResponse.json(
      { message: 'Error fetching invoice analytics' },
      { status: 500 }
    );
  }
}
