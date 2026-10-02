import type { NextRequest } from 'next/server';
import { mailCalendarLinkRoute } from '@/lib/mail/calendar-link-route';

type Context = {
  params: Promise<{ wsId: string; mailboxId: string; messageId: string }>;
};
export function GET(request: NextRequest, { params }: Context) {
  return mailCalendarLinkRoute(request, params, 'get');
}
export function PUT(request: NextRequest, { params }: Context) {
  return mailCalendarLinkRoute(request, params, 'confirm');
}
export function DELETE(request: NextRequest, { params }: Context) {
  return mailCalendarLinkRoute(request, params, 'unlink');
}
