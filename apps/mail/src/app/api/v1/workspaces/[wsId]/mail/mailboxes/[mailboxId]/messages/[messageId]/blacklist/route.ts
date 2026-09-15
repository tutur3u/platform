import { MAX_NAME_LENGTH } from '@tuturuuu/utils/constants';
import { EMAIL_BLACKLIST_REGEX } from '@tuturuuu/utils/email/validation';
import { resolveTuturuuuInfrastructureAppUrl } from '@tuturuuu/utils/next-config';
import { connection, type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getMailBlacklistContext,
  MAIL_BLACKLIST_REASONS,
} from '@/lib/mail/repository/blacklist';
import type { AnyRecord } from '@/lib/mail/repository/shared';
import { parseJsonBody, withMailContext } from '@/lib/mail/route-utils';

type Params = {
  params: Promise<{ wsId: string; mailboxId: string; messageId: string }>;
};
const schema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(MAX_NAME_LENGTH)
    .regex(EMAIL_BLACKLIST_REGEX),
  reason: z.enum([
    'inactive',
    'verification_failed',
    'spam',
    'policy_violation',
    'fraud',
  ]),
});

export async function GET(request: NextRequest, { params }: Params) {
  await connection();
  const { wsId, mailboxId, messageId } = await params;
  return withMailContext(request, wsId, async (ctx) => {
    const access = await getMailBlacklistContext(ctx, mailboxId, messageId);
    if (!access) return NextResponse.json({ canManage: false, recipients: [] });
    if (!access.recipients.length)
      return NextResponse.json({ canManage: true, recipients: [] });
    const blocked = await existingRecipients(access.admin, access.recipients);
    return NextResponse.json({
      canManage: true,
      infrastructureOrigin: resolveTuturuuuInfrastructureAppUrl(),
      recipients: access.recipients.map((email) => ({
        email,
        blocked: blocked.has(email),
      })),
    });
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { wsId, mailboxId, messageId } = await params;
  const body = await parseJsonBody(request, schema);
  if (!body.ok) return body.response;
  return withMailContext(request, wsId, async (ctx) => {
    const access = await getMailBlacklistContext(ctx, mailboxId, messageId);
    if (!access)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!access.recipients.includes(body.data.email))
      return NextResponse.json(
        { error: 'Not a failed recipient of this message' },
        { status: 400 }
      );
    const existing = await existingRecipients(access.admin, [body.data.email]);
    if (existing.has(body.data.email))
      return NextResponse.json({ blocked: true, alreadyBlocked: true });
    const { error } = await access.admin.from('email_blacklist').insert({
      entry_type: 'email',
      value: body.data.email,
      reason: MAIL_BLACKLIST_REASONS[body.data.reason],
      added_by_user_id: ctx.user.id,
    });
    if (error && error.code !== '23505')
      throw new Error(`Failed to add blacklist entry: ${error.message}`);
    return NextResponse.json({
      blocked: true,
      alreadyBlocked: error?.code === '23505',
    });
  });
}

async function existingRecipients(admin: AnyRecord, recipients: string[]) {
  const matches = await Promise.all(
    recipients.map(async (email) => {
      const { data, error } = await admin
        .from('email_blacklist')
        .select('value')
        .eq('entry_type', 'email')
        .ilike('value', email.replace(/[\\%_]/gu, '\\$&'));
      if (error) throw new Error(`Failed to check blacklist: ${error.message}`);
      return (data ?? []).map((entry: { value: string }) =>
        entry.value.toLowerCase()
      );
    })
  );
  return new Set<string>(matches.flat());
}
