import { type NextRequest, NextResponse } from 'next/server';
import {
  getMailboxSettings,
  updateMailboxSettings,
} from '@/lib/mail/repository/settings';
import { parseJsonBody, withMailContext } from '@/lib/mail/route-utils';
import { updateMailMailboxSettingsSchema } from '@/lib/mail/schemas';

type RouteContext = {
  params: Promise<{ mailboxId: string; wsId: string }>;
};

export async function GET(request: NextRequest, { params }: RouteContext) {
  const { mailboxId, wsId } = await params;
  return withMailContext(request, wsId, async (ctx) => {
    const settings = await getMailboxSettings({ ctx, mailboxId });
    if (!settings)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ settings });
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const { mailboxId, wsId } = await params;
  const body = await parseJsonBody(request, updateMailMailboxSettingsSchema);
  if (!body.ok) return body.response;
  return withMailContext(request, wsId, async (ctx) => {
    const settings = await updateMailboxSettings({
      ctx,
      mailboxId,
      payload: body.data,
    });
    if (!settings)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ settings });
  });
}
