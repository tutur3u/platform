import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { withCronLogDrain } from '@/lib/infrastructure/log-drain';
import { processPeriodicReportAutomation } from '@/lib/user-report-automation/processor';

export async function GET(request: NextRequest) {
  return withCronLogDrain(
    {
      jobId: 'process-report-automation',
      path: '/api/cron/process-report-automation',
      request,
    },
    async () => {
      const cronSecret =
        process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET;
      if (!cronSecret) {
        return NextResponse.json(
          { message: 'Cron secret is not configured' },
          { status: 500 }
        );
      }
      if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
      }

      const workerId = `report-automation:${crypto.randomUUID()}`;
      const result = await processPeriodicReportAutomation(
        await createAdminClient(),
        workerId
      );
      return NextResponse.json({ ok: true, ...result });
    }
  );
}
