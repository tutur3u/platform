import { authorizeInventoryWorkspace } from '@tuturuuu/inventory-core/commerce/auth';
import { canViewInventorySales } from '@tuturuuu/inventory-core/permissions';
import { listInventorySalesExportRows } from '@tuturuuu/inventory-core/sales-export';
import { getInventorySalesPeriod } from '@tuturuuu/inventory-core/sales-periods';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { resolveSupportedCurrency } from '@tuturuuu/utils/currencies';
import { getWorkspaceConfig } from '@tuturuuu/utils/workspace-helper';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  buildInventorySalesCsv,
  buildInventorySalesWorkbook,
  inventorySalesExportFilename,
  normalizeInventorySalesExportRows,
} from './export-format';

const SearchParamsSchema = z.object({
  format: z.enum(['csv', 'xlsx']),
  period_id: z.uuid(),
});

interface Params {
  params: Promise<{ wsId: string }>;
}

const DOWNLOAD_HEADERS = {
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

export async function GET(req: Request, { params }: Params) {
  await connection();
  const { wsId: id } = await params;
  const authorization = await authorizeInventoryWorkspace(req, id);
  if (!authorization.ok) return authorization.response;

  const { permissions, wsId } = authorization.value;
  if (
    !canViewInventorySales(permissions) ||
    !permissions.containsPermission('export_finance_data')
  ) {
    return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
  }

  const parsed = SearchParamsSchema.safeParse(
    Object.fromEntries(new URL(req.url).searchParams.entries())
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Invalid query parameters', errors: parsed.error.issues },
      { status: 400 }
    );
  }

  const { format, period_id: periodId } = parsed.data;
  const sbAdmin = await createAdminClient();

  try {
    const period = await getInventorySalesPeriod({
      periodId,
      sbAdmin,
      wsId,
    });
    if (!period) {
      return NextResponse.json(
        { message: 'Sales period not found' },
        { status: 404 }
      );
    }

    const [rawRows, configuredCurrency] = await Promise.all([
      listInventorySalesExportRows({ periodId, sbAdmin, wsId }),
      getWorkspaceConfig(wsId, 'DEFAULT_CURRENCY'),
    ]);
    const rows = normalizeInventorySalesExportRows(
      rawRows,
      resolveSupportedCurrency(configuredCurrency)
    );
    const filename = inventorySalesExportFilename(period.name, format);

    if (format === 'xlsx') {
      return new NextResponse(buildInventorySalesWorkbook(rows), {
        headers: {
          ...DOWNLOAD_HEADERS,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }

    return new NextResponse(buildInventorySalesCsv(rows), {
      headers: {
        ...DOWNLOAD_HEADERS,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'text/csv; charset=utf-8',
      },
    });
  } catch (error) {
    console.error('Error exporting inventory sales period', error);
    return NextResponse.json(
      { message: 'Failed to export inventory sales period' },
      { status: 500 }
    );
  }
}
