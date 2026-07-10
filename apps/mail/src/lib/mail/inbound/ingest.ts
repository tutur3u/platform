import { createHash } from 'node:crypto';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { createSnippet, sanitizeMailHtml, stripHtml } from '../html';
import { normalizeAddress, parseRawEmail } from './parser';
import type { AnyRecord, ParsedEmail, SesNotification } from './types';

function privateTable(client: AnyRecord, table: string) {
  return client.schema('private').from(table);
}

async function fetchRawEmailFromS3({
  bucket,
  key,
}: {
  bucket: string;
  key: string;
}) {
  const client = new S3Client({
    region: process.env.MAIL_SES_REGION || process.env.AWS_REGION,
  });
  const response = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );

  return response.Body?.transformToString() ?? null;
}

function resolveS3Object(notification: SesNotification) {
  const action = notification.receipt?.action;
  const bucket = action?.bucketName ?? process.env.MAIL_SES_INBOUND_BUCKET;
  const key =
    action?.objectKey ??
    (notification.mail?.messageId
      ? `${process.env.MAIL_SES_INBOUND_KEY_PREFIX ?? ''}${notification.mail.messageId}`
      : null);

  return bucket && key ? { bucket, key } : null;
}

export async function ensureMailboxForRecipient(
  admin: AnyRecord,
  address: string,
  domainId: string
) {
  const normalizedAddress = address.toLowerCase();
  const { data: existing, error: existingError } = await privateTable(
    admin,
    'mail_mailboxes'
  )
    .select('*')
    .eq('address', normalizedAddress)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing?.status === 'active') return existing;

  const { data: user } = await admin
    .from('users')
    .select('id, email, display_name, full_name')
    .eq('email', normalizedAddress)
    .maybeSingle();

  if (!user?.id) return null;

  const { data: mailbox, error } = await privateTable(admin, 'mail_mailboxes')
    .insert({
      address: normalizedAddress,
      created_by: user.id,
      display_name:
        user.full_name ?? user.display_name ?? normalizedAddress.split('@')[0],
      domain_id: domainId,
      type: 'personal',
    })
    .select('*')
    .single();

  if (error) throw error;

  await privateTable(admin, 'mail_mailbox_members').upsert(
    {
      created_by: user.id,
      mailbox_id: mailbox.id,
      role: 'owner',
      user_id: user.id,
    },
    { onConflict: 'mailbox_id,user_id' }
  );

  return mailbox;
}

async function ensureLabel(admin: AnyRecord, mailboxId: string, slug: string) {
  const name = slug.slice(0, 1).toUpperCase() + slug.slice(1);
  const { data, error } = await privateTable(admin, 'mail_labels')
    .upsert(
      {
        kind: 'system',
        mailbox_id: mailboxId,
        name,
        slug,
      },
      { onConflict: 'mailbox_id,slug' }
    )
    .select('*')
    .single();

  if (error) throw error;
  return data;
}

function normalizedSubject(subject: string) {
  return subject
    .replace(/^(re|fw|fwd):\s*/giu, '')
    .trim()
    .toLowerCase();
}

async function resolveInboundThread(
  admin: AnyRecord,
  mailboxId: string,
  parsed: ParsedEmail
) {
  const authoritativeIds = [
    parsed.inReplyTo,
    ...parsed.references.slice().reverse(),
  ].filter((value): value is string => Boolean(value));

  if (authoritativeIds.length > 0) {
    const { data: parent, error } = await privateTable(admin, 'mail_messages')
      .select('thread_id')
      .eq('mailbox_id', mailboxId)
      .in('internet_message_id', authoritativeIds)
      .not('thread_id', 'is', null)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (parent?.thread_id) {
      const { data: thread, error: threadError } = await privateTable(
        admin,
        'mail_threads'
      )
        .select('*')
        .eq('id', parent.thread_id)
        .eq('mailbox_id', mailboxId)
        .single();
      if (threadError) throw threadError;
      return thread;
    }
  }

  const isReplySubject = /^(re|fw|fwd):\s*/iu.test(parsed.subject);
  if (authoritativeIds.length === 0 && isReplySubject) {
    const cutoff = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000
    ).toISOString();
    const { data: fallback, error } = await privateTable(admin, 'mail_threads')
      .select('*')
      .eq('mailbox_id', mailboxId)
      .eq('normalized_subject', normalizedSubject(parsed.subject))
      .gte('last_message_at', cutoff)
      .order('last_message_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (fallback) return fallback;
  }

  const { data: created, error } = await privateTable(admin, 'mail_threads')
    .insert({
      last_message_at: new Date().toISOString(),
      mailbox_id: mailboxId,
      normalized_subject: normalizedSubject(parsed.subject),
      subject: parsed.subject,
    })
    .select('*')
    .single();
  if (error) throw error;
  return created;
}

export async function createInboundMessage({
  admin,
  mailbox,
  parsed,
  provider,
  providerMessageId,
  rawMessageId,
}: {
  admin: AnyRecord;
  mailbox: AnyRecord;
  parsed: ParsedEmail;
  provider: 'cloudflare' | 'ses';
  providerMessageId: string;
  rawMessageId: string;
}) {
  const { data: existingMessage, error: existingMessageError } =
    await privateTable(admin, 'mail_messages')
      .select('*')
      .eq('mailbox_id', mailbox.id)
      .eq('provider', provider)
      .eq('provider_message_id', providerMessageId)
      .maybeSingle();
  if (existingMessageError) throw existingMessageError;
  if (existingMessage) return existingMessage;

  if (parsed.internetMessageId) {
    const {
      data: existingInternetMessage,
      error: existingInternetMessageError,
    } = await privateTable(admin, 'mail_messages')
      .select('*')
      .eq('mailbox_id', mailbox.id)
      .eq('internet_message_id', parsed.internetMessageId)
      .maybeSingle();
    if (existingInternetMessageError) throw existingInternetMessageError;
    if (existingInternetMessage) return existingInternetMessage;
  }

  const sanitizedHtml = parsed.bodyHtml
    ? sanitizeMailHtml(parsed.bodyHtml)
    : null;
  const bodyText =
    parsed.bodyText ?? (sanitizedHtml ? stripHtml(sanitizedHtml) : null);
  const thread = await resolveInboundThread(admin, mailbox.id, parsed);

  const { data: message, error: messageError } = await privateTable(
    admin,
    'mail_messages'
  )
    .insert({
      body_html: parsed.bodyHtml,
      body_text: bodyText,
      direction: 'inbound',
      from_address: parsed.from?.address ?? 'unknown@example.invalid',
      from_name: parsed.from?.displayName,
      has_attachments: parsed.attachments.length > 0,
      in_reply_to: parsed.inReplyTo,
      internet_message_id: parsed.internetMessageId,
      mailbox_id: mailbox.id,
      provider,
      provider_message_id: providerMessageId,
      raw_message_id: rawMessageId,
      received_at: new Date().toISOString(),
      references_headers: parsed.references,
      sanitized_html: sanitizedHtml,
      snippet: createSnippet({ html: sanitizedHtml, text: bodyText }),
      status: 'received',
      subject: parsed.subject,
      thread_id: thread.id,
    })
    .select('*')
    .single();

  if (messageError) throw messageError;

  const recipientRows = [
    ...(parsed.from
      ? [{ ...parsed.from, kind: 'from', message_id: message.id }]
      : []),
    ...parsed.to.map((recipient) => ({
      ...recipient,
      kind: 'to',
      message_id: message.id,
    })),
    ...parsed.cc.map((recipient) => ({
      ...recipient,
      kind: 'cc',
      message_id: message.id,
    })),
  ].map((recipient) => ({
    address: recipient.address,
    display_name: recipient.displayName,
    kind: recipient.kind,
    message_id: recipient.message_id,
  }));

  if (recipientRows.length > 0) {
    await privateTable(admin, 'mail_recipients').insert(recipientRows);
  }

  if (parsed.attachments.length > 0) {
    await privateTable(admin, 'mail_attachments').insert(
      parsed.attachments.map((attachment) => ({
        content_id: attachment.contentId,
        content_type: attachment.contentType,
        disposition: attachment.disposition,
        filename: attachment.filename,
        message_id: message.id,
        raw_message_id: rawMessageId,
        size_bytes: attachment.sizeBytes,
        stored_object_id: attachment.storedObjectId ?? null,
      }))
    );
  }

  const inboxLabel = await ensureLabel(admin, mailbox.id, 'inbox');
  await privateTable(admin, 'mail_message_labels').upsert(
    {
      label_id: inboxLabel.id,
      message_id: message.id,
    },
    { onConflict: 'message_id,label_id' }
  );

  await privateTable(admin, 'mail_threads')
    .update({
      last_message_at: new Date().toISOString(),
      message_count: (thread.message_count ?? 0) + 1,
      unread_count: (thread.unread_count ?? 0) + 1,
    })
    .eq('id', thread.id);

  return message;
}

export async function ingestSesNotification(notification: SesNotification) {
  const admin = await createAdminClient({ noCookie: true });
  const providerMessageId = notification.mail?.messageId;

  if (!providerMessageId) {
    throw new Error('Missing SES message id');
  }

  const s3Object = resolveS3Object(notification);
  const recipients = [
    ...(notification.receipt?.recipients ?? []),
    ...(notification.mail?.destination ?? []),
  ]
    .map(normalizeAddress)
    .filter((address, index, list) => list.indexOf(address) === index);

  const { data: existingJob, error: existingJobError } = await privateTable(
    admin,
    'mail_inbound_jobs'
  )
    .select('id, status')
    .eq('provider', 'ses')
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();

  if (existingJobError) throw existingJobError;
  if (existingJob?.status === 'imported') {
    return { imported: 0, status: 'duplicate' as const };
  }

  const { data: job, error: jobError } = await privateTable(
    admin,
    'mail_inbound_jobs'
  )
    .upsert(
      {
        payload: notification,
        provider: 'ses',
        provider_message_id: providerMessageId,
        receipt_recipients: recipients,
        s3_bucket: s3Object?.bucket,
        s3_key: s3Object?.key,
        sns_topic_arn: notification.receipt?.action?.topicArn,
        status: 'processing',
      },
      { onConflict: 'provider,provider_message_id' }
    )
    .select('*')
    .single();

  if (jobError) throw jobError;

  if (!s3Object) {
    await privateTable(admin, 'mail_inbound_jobs')
      .update({
        error_message: 'No S3 bucket/key configured for SES raw message',
        status: 'failed',
      })
      .eq('id', job.id);

    return { imported: 0, status: 'missing_s3_object' as const };
  }

  const rawEmail = await fetchRawEmailFromS3(s3Object);
  if (!rawEmail) {
    await privateTable(admin, 'mail_inbound_jobs')
      .update({
        error_message: 'S3 object body was empty',
        status: 'failed',
      })
      .eq('id', job.id);

    return { imported: 0, status: 'missing_raw_email' as const };
  }

  const sha256 = createHash('sha256').update(rawEmail).digest('hex');
  const parsed = parseRawEmail(rawEmail);
  const { data: rawMessage, error: rawError } = await privateTable(
    admin,
    'mail_raw_messages'
  )
    .upsert(
      {
        dkim_verdict: notification.receipt?.dkimVerdict?.status,
        dmarc_verdict: notification.receipt?.dmarcVerdict?.status,
        provider: 'ses',
        provider_message_id: providerMessageId,
        provider_payload: notification,
        raw_headers: parsed.headers,
        s3_bucket: s3Object.bucket,
        s3_key: s3Object.key,
        sha256,
        size_bytes: Buffer.byteLength(rawEmail),
        spam_verdict: notification.receipt?.spamVerdict?.status,
        spf_verdict: notification.receipt?.spfVerdict?.status,
        status: 'imported',
        virus_verdict: notification.receipt?.virusVerdict?.status,
      },
      { onConflict: 'provider,provider_message_id' }
    )
    .select('*')
    .single();

  if (rawError) throw rawError;

  const matchedMailboxes = [];
  for (const recipient of recipients) {
    const domainName = recipient.split('@')[1];
    const { data: domain, error: domainError } = await privateTable(
      admin,
      'mail_domains'
    )
      .select('id')
      .eq('domain', domainName)
      .eq('status', 'active')
      .eq('inbound_provider', 'ses')
      .maybeSingle();
    if (domainError) throw domainError;
    if (!domain?.id) continue;
    const mailbox = await ensureMailboxForRecipient(
      admin,
      recipient,
      domain.id
    );
    if (mailbox) matchedMailboxes.push(mailbox);
  }

  if (matchedMailboxes.length === 0) {
    await Promise.all([
      privateTable(admin, 'mail_raw_messages')
        .update({ status: 'quarantined' })
        .eq('id', rawMessage.id),
      privateTable(admin, 'mail_inbound_jobs')
        .update({
          error_message: 'No active Tuturuuu mailbox matched SES recipients',
          processed_at: new Date().toISOString(),
          status: 'quarantined',
        })
        .eq('id', job.id),
    ]);

    return { imported: 0, status: 'quarantined' as const };
  }

  for (const mailbox of matchedMailboxes) {
    await createInboundMessage({
      admin,
      mailbox,
      parsed,
      provider: 'ses',
      providerMessageId,
      rawMessageId: rawMessage.id,
    });
  }

  await privateTable(admin, 'mail_inbound_jobs')
    .update({
      processed_at: new Date().toISOString(),
      status: 'imported',
    })
    .eq('id', job.id);

  return { imported: matchedMailboxes.length, status: 'imported' as const };
}

export function logSesInboundError(error: unknown, messageId?: string) {
  console.error('[mail] SES inbound ingestion failed', {
    error,
    messageId,
  });
}
