import type {
  BulkUpdateMailPayload,
  CreateMailOrganizationPayload,
  MailFolderDefinition,
  MailLabel,
  MailRouteContext,
  UpdateMailOrganizationPayload,
} from '../types';
import { requireMailboxAccess } from './bootstrap';
import { type AnyRecord, privateTable, toLabel } from './shared';

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replaceAll(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-|-$/gu, '')
    .slice(0, 80);
}

function toFolder(row: AnyRecord): MailFolderDefinition {
  return {
    id: row.id,
    kind: row.kind,
    mailboxId: row.mailbox_id,
    name: row.name,
    slug: row.slug,
  };
}

export async function listMailboxOrganization({
  ctx,
  mailboxId,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
}) {
  const access = await requireMailboxAccess(ctx, mailboxId);
  if (!access) return null;
  const [
    { data: labels, error: labelError },
    { data: folders, error: folderError },
  ] = await Promise.all([
    privateTable(access.admin, 'mail_labels')
      .select('*')
      .eq('mailbox_id', mailboxId)
      .order('kind', { ascending: false })
      .order('name'),
    privateTable(access.admin, 'mail_folders')
      .select('*')
      .eq('mailbox_id', mailboxId)
      .order('kind', { ascending: false })
      .order('name'),
  ]);
  if (labelError)
    throw new Error(`Failed to list labels: ${labelError.message}`);
  if (folderError)
    throw new Error(`Failed to list folders: ${folderError.message}`);
  return {
    folders: (folders ?? []).map(toFolder),
    labels: (labels ?? []).map(toLabel),
  };
}

export async function createMailboxLabel({
  ctx,
  mailboxId,
  payload,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  payload: CreateMailOrganizationPayload;
}): Promise<MailLabel | null> {
  const access = await requireMailboxAccess(ctx, mailboxId, ['owner', 'admin']);
  if (!access) return null;
  const slug = slugify(payload.name);
  if (!slug) throw new Error('Label name must contain letters or numbers');
  const { data, error } = await privateTable(access.admin, 'mail_labels')
    .insert({
      color: payload.color ?? null,
      created_by: ctx.user.id,
      kind: 'custom',
      mailbox_id: mailboxId,
      name: payload.name,
      slug,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to create label: ${error.message}`);
  return toLabel(data);
}

export async function updateMailboxLabel({
  ctx,
  labelId,
  mailboxId,
  payload,
}: {
  ctx: MailRouteContext;
  labelId: string;
  mailboxId: string;
  payload: UpdateMailOrganizationPayload;
}): Promise<MailLabel | null> {
  const access = await requireMailboxAccess(ctx, mailboxId, ['owner', 'admin']);
  if (!access) return null;
  const patch: AnyRecord = { color: payload.color };
  if (payload.name) {
    patch.name = payload.name;
    patch.slug = slugify(payload.name);
  }
  const { data, error } = await privateTable(access.admin, 'mail_labels')
    .update(patch)
    .eq('id', labelId)
    .eq('mailbox_id', mailboxId)
    .eq('kind', 'custom')
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to update label: ${error.message}`);
  return data ? toLabel(data) : null;
}

export async function deleteMailboxLabel(args: {
  ctx: MailRouteContext;
  labelId: string;
  mailboxId: string;
}) {
  const access = await requireMailboxAccess(args.ctx, args.mailboxId, [
    'owner',
    'admin',
  ]);
  if (!access) return false;
  const { data, error } = await privateTable(access.admin, 'mail_labels')
    .delete()
    .eq('id', args.labelId)
    .eq('mailbox_id', args.mailboxId)
    .eq('kind', 'custom')
    .select('id');
  if (error) throw new Error(`Failed to delete label: ${error.message}`);
  return Boolean(data?.length);
}

export async function createMailboxFolder({
  ctx,
  mailboxId,
  payload,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  payload: CreateMailOrganizationPayload;
}): Promise<MailFolderDefinition | null> {
  const access = await requireMailboxAccess(ctx, mailboxId, ['owner', 'admin']);
  if (!access) return null;
  const slug = slugify(payload.name);
  if (!slug) throw new Error('Folder name must contain letters or numbers');
  const { data, error } = await privateTable(access.admin, 'mail_folders')
    .insert({
      created_by: ctx.user.id,
      kind: 'custom',
      mailbox_id: mailboxId,
      name: payload.name,
      slug,
    })
    .select('*')
    .single();
  if (error) throw new Error(`Failed to create folder: ${error.message}`);
  return toFolder(data);
}

export async function updateMailboxFolder({
  ctx,
  folderId,
  mailboxId,
  payload,
}: {
  ctx: MailRouteContext;
  folderId: string;
  mailboxId: string;
  payload: UpdateMailOrganizationPayload;
}): Promise<MailFolderDefinition | null> {
  const access = await requireMailboxAccess(ctx, mailboxId, ['owner', 'admin']);
  if (!access) return null;
  if (!payload.name) return null;
  const { data, error } = await privateTable(access.admin, 'mail_folders')
    .update({ name: payload.name, slug: slugify(payload.name) })
    .eq('id', folderId)
    .eq('mailbox_id', mailboxId)
    .eq('kind', 'custom')
    .select('*')
    .maybeSingle();
  if (error) throw new Error(`Failed to update folder: ${error.message}`);
  return data ? toFolder(data) : null;
}

export async function deleteMailboxFolder(args: {
  ctx: MailRouteContext;
  folderId: string;
  mailboxId: string;
}) {
  const access = await requireMailboxAccess(args.ctx, args.mailboxId, [
    'owner',
    'admin',
  ]);
  if (!access) return false;
  const { data, error } = await privateTable(access.admin, 'mail_folders')
    .delete()
    .eq('id', args.folderId)
    .eq('mailbox_id', args.mailboxId)
    .eq('kind', 'custom')
    .select('id');
  if (error) throw new Error(`Failed to delete folder: ${error.message}`);
  return Boolean(data?.length);
}

export async function bulkUpdateMail({
  ctx,
  mailboxId,
  payload,
}: {
  ctx: MailRouteContext;
  mailboxId: string;
  payload: BulkUpdateMailPayload;
}) {
  const globalAction = [
    'add_label',
    'remove_label',
    'move_to_folder',
    'clear_folder',
  ].includes(payload.action);
  const access = await requireMailboxAccess(
    ctx,
    mailboxId,
    globalAction ? ['owner', 'admin', 'sender'] : undefined
  );
  if (!access) return null;

  const { data: messages, error: messageError } = await privateTable(
    access.admin,
    'mail_messages'
  )
    .select('id')
    .eq('mailbox_id', mailboxId)
    .in('id', payload.messageIds);
  if (messageError)
    throw new Error(`Failed to validate messages: ${messageError.message}`);
  const messageIds: string[] = (messages ?? []).map(
    (row: AnyRecord) => row.id as string
  );
  if (messageIds.length !== new Set(payload.messageIds).size) return null;

  if (payload.action === 'add_label' || payload.action === 'remove_label') {
    const { data: label } = await privateTable(access.admin, 'mail_labels')
      .select('id')
      .eq('id', payload.labelId)
      .eq('mailbox_id', mailboxId)
      .maybeSingle();
    if (!label) return null;
    if (payload.action === 'add_label') {
      const { error } = await privateTable(
        access.admin,
        'mail_message_labels'
      ).upsert(
        messageIds.map((messageId) => ({
          label_id: label.id,
          message_id: messageId,
        })),
        { onConflict: 'message_id,label_id' }
      );
      if (error) throw new Error(`Failed to add label: ${error.message}`);
    } else {
      const { error } = await privateTable(access.admin, 'mail_message_labels')
        .delete()
        .eq('label_id', label.id)
        .in('message_id', messageIds);
      if (error) throw new Error(`Failed to remove label: ${error.message}`);
    }
  } else if (
    payload.action === 'move_to_folder' ||
    payload.action === 'clear_folder'
  ) {
    if (payload.action === 'move_to_folder') {
      const { data: folder } = await privateTable(access.admin, 'mail_folders')
        .select('id')
        .eq('id', payload.folderId)
        .eq('mailbox_id', mailboxId)
        .maybeSingle();
      if (!folder) return null;
    }
    const { error: clearError } = await privateTable(
      access.admin,
      'mail_message_folders'
    )
      .delete()
      .in('message_id', messageIds);
    if (clearError)
      throw new Error(`Failed to clear folders: ${clearError.message}`);
    if (payload.action === 'move_to_folder' && payload.folderId) {
      const { error } = await privateTable(
        access.admin,
        'mail_message_folders'
      ).insert(
        messageIds.map((messageId) => ({
          folder_id: payload.folderId,
          message_id: messageId,
        }))
      );
      if (error) throw new Error(`Failed to move messages: ${error.message}`);
    }
  } else {
    const now = new Date().toISOString();
    const patch: AnyRecord = {};
    if (payload.action === 'mark_read') patch.read_at = now;
    if (payload.action === 'mark_unread') patch.read_at = null;
    if (payload.action === 'star') patch.starred_at = now;
    if (payload.action === 'unstar') patch.starred_at = null;
    if (payload.action === 'archive') patch.archived_at = now;
    if (payload.action === 'trash') patch.trashed_at = now;
    if (payload.action === 'restore') {
      patch.archived_at = null;
      patch.trashed_at = null;
    }
    const { error } = await privateTable(
      access.admin,
      'mail_message_user_state'
    ).upsert(
      messageIds.map((messageId) => ({
        ...patch,
        mailbox_id: mailboxId,
        message_id: messageId,
        user_id: ctx.user.id,
      })),
      { onConflict: 'message_id,user_id' }
    );
    if (error) throw new Error(`Failed to update messages: ${error.message}`);
  }

  return { updated: messageIds.length };
}
