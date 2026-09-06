import type { createInboundMessage } from '../inbound/ingest';
import { type AnyRecord, privateTable } from '../repository/shared';
import { authenticateGroupSender } from './authentication';
import { permitsGroupScope, readGroupPolicy } from './policy';

type InboundArgs = Parameters<typeof createInboundMessage>[0];
export async function deliverGroupMessage(
  args: InboundArgs,
  writeMessage: typeof createInboundMessage,
  authenticate = authenticateGroupSender
): Promise<{
  imported: number;
  status: 'imported' | 'quarantined';
  reason?: string;
} | null> {
  const policy = readGroupPolicy(args.mailbox.metadata);
  if (!policy) return null;
  const { admin, mailbox, parsed } = args;
  const sender = parsed.from?.address.toLowerCase();
  if (!sender || !(await authenticate(admin, args.rawMessageId, sender))) {
    return {
      imported: 0,
      status: 'quarantined',
      reason: 'Group sender requires a valid aligned DKIM signature',
    };
  }
  const { data: source, error: sourceError } = await privateTable(
    admin,
    'mail_mailboxes'
  )
    .select('created_by,status,domain_id,type')
    .eq('address', sender)
    .maybeSingle();
  if (sourceError) throw sourceError;
  const members: AnyRecord[] = [];
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await privateTable(admin, 'mail_mailbox_members')
      .select('user_id,role')
      .eq('mailbox_id', mailbox.id)
      .order('user_id')
      .range(offset, offset + 199);
    if (error) throw error;
    members.push(...(data ?? []));
    if (!data || data.length < 200) break;
  }
  const role = members?.find(
    (member: AnyRecord) =>
      source?.type === 'personal' && member.user_id === source.created_by
  )?.role;
  const actor = {
    activeInternal:
      source?.status === 'active' && source?.domain_id === mailbox.domain_id,
    role,
  };
  if (
    (source && source.status !== 'active') ||
    !permitsGroupScope(policy.posting, actor) ||
    (parsed.attachments.length > 0 &&
      !permitsGroupScope(policy.attachments, actor))
  ) {
    return {
      imported: 0,
      status: 'quarantined',
      reason: 'Group posting policy does not permit this message',
    };
  }
  const userIds = [
    ...new Set<string>(
      (members ?? []).map((member: AnyRecord) => member.user_id)
    ),
  ];
  if (userIds.length === 0) return { imported: 0, status: 'imported' };
  let imported = 0;
  for (let offset = 0; offset < userIds.length; offset += 200) {
    const { data: destinations, error: destinationError } = await privateTable(
      admin,
      'mail_mailboxes'
    )
      .select('*')
      .in('created_by', userIds.slice(offset, offset + 200))
      .eq('type', 'personal')
      .eq('status', 'active')
      .eq('domain_id', mailbox.domain_id);
    if (destinationError) throw destinationError;
    // Personal copies only; never create a shared group message or thread.
    // Provider/internet message IDs make retries and overlapping groups idempotent.
    for (const destination of destinations ?? []) {
      await writeMessage({ ...args, mailbox: destination });
      imported += 1;
    }
  }
  return { imported, status: 'imported' };
}
