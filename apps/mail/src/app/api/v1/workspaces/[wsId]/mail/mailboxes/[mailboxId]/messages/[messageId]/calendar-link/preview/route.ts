import type { NextRequest } from 'next/server';
import { mailCalendarLinkRoute } from '@/lib/mail/calendar-link-route';
export function POST(
  request: NextRequest,
  {
    params,
  }: { params: Promise<{ wsId: string; mailboxId: string; messageId: string }> }
) {
  return mailCalendarLinkRoute(request, params, 'preview');
}
