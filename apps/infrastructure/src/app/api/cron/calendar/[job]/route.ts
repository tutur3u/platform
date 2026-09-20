import { connection } from 'next/server';
import { forwardCalendarCron } from '@/lib/mobile-calendar/cron-gateway';
import { loadCalendarGatewaySecret } from '@/lib/mobile-calendar/secret';

export const maxDuration = 300;

export async function GET(request: Request) {
  await connection();
  return forwardCalendarCron(request, {
    cronSecret: process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET,
    loadSecret: loadCalendarGatewaySecret,
    fetch,
  });
}
