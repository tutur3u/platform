import { createHmac, timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import { createInboundMessage, resolveInboundMailbox } from './ingest';
import type { AnyRecord, ParsedEmail } from './types';

const addressSchema = z.object({
  address: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  displayName: z.string().nullable(),
});

const storedObjectSchema = z.object({
  bucketName: z.string().min(1).max(255),
  contentId: z.string().max(998).optional(),
  contentType: z.string().min(1).max(255),
  filename: z.string().max(1024).optional(),
  objectKey: z.string().min(1).max(2048),
  objectKind: z.enum(['attachment', 'body', 'raw_mime']),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  sizeBytes: z
    .number()
    .int()
    .nonnegative()
    .max(25 * 1024 * 1024),
});

const domainCheckSchema = z.object({
  domain: z.string().trim().toLowerCase().max(253),
  recipient: z
    .string()
    .email()
    .transform((value) => value.toLowerCase())
    .optional(),
  type: z.literal('domain_check'),
});

const ingestSchema = z.object({
  bodyObjects: z.array(storedObjectSchema).max(2).default([]),
  deliveryId: z.string().regex(/^[a-f0-9]{64}$/u),
  domain: z.string().trim().toLowerCase().max(253),
  envelope: z.object({
    from: z.string().max(998),
    observedTo: z
      .string()
      .email()
      .transform((value) => value.toLowerCase())
      .optional(),
    to: z
      .string()
      .email()
      .transform((value) => value.toLowerCase()),
  }),
  ingressDomain: z.string().trim().toLowerCase().max(253).optional(),
  parsed: z
    .object({
      attachments: z
        .array(
          z.object({
            contentId: z.string().nullable(),
            contentType: z.string().min(1).max(255),
            disposition: z.enum(['attachment', 'inline']),
            filename: z.string().min(1).max(1024),
            sizeBytes: z.number().int().nonnegative(),
            storedObject: storedObjectSchema,
          })
        )
        .max(200),
      bodyHtml: z.string().nullable(),
      bodyText: z.string().nullable(),
      cc: z.array(addressSchema).max(200),
      from: addressSchema.nullable(),
      headers: z.record(z.string(), z.string()),
      inReplyTo: z.string().max(4096).nullable(),
      internetMessageId: z.string().max(4096).nullable(),
      references: z.array(z.string().max(4096)).max(100),
      subject: z.string().max(998),
      to: z.array(addressSchema).max(200),
    })
    .optional(),
  quarantineReason: z.string().max(255).nullable().optional(),
  rawObject: storedObjectSchema,
  type: z.literal('ingest'),
});

export const cloudflareInboundEventSchema = z.discriminatedUnion('type', [
  domainCheckSchema,
  ingestSchema,
]);

function privateTable(client: AnyRecord, table: string) {
  return client.schema('private').from(table);
}

export function verifyCloudflareWebhookSignature({
  body,
  now = Date.now(),
  secret,
  signature,
  timestamp,
}: {
  body: string;
  now?: number;
  secret: string;
  signature: string | null;
  timestamp: string | null;
}) {
  if (!signature || !timestamp || !/^\d+$/u.test(timestamp)) return false;
  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isSafeInteger(timestampMs)) return false;
  if (Math.abs(now - timestampMs) > 5 * 60 * 1000) return false;

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  if (!/^[a-f0-9]{64}$/u.test(signature)) return false;
  return timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(signature, 'hex')
  );
}

async function getCloudflareDomain(admin: AnyRecord, domain: string) {
  const { data, error } = await privateTable(admin, 'mail_domains')
    .select('*')
    .eq('domain', domain)
    .maybeSingle();
  if (error) throw error;
  return data;
}

type MailDomain = {
  canonical_domain_id?: string | null;
  catch_all_auto_draft_enabled?: boolean;
  domain: string;
  id: string;
  inbound_provider: string;
  status: string;
};

async function resolveCloudflareDomainRoute(
  admin: AnyRecord,
  ingressDomainName: string
) {
  const ingressDomain = (await getCloudflareDomain(
    admin,
    ingressDomainName
  )) as MailDomain | null;
  if (
    ingressDomain?.status !== 'active' ||
    ingressDomain.inbound_provider !== 'cloudflare'
  ) {
    return null;
  }

  const canonicalDomain = ingressDomain.canonical_domain_id
    ? ((await privateTable(admin, 'mail_domains')
        .select('*')
        .eq('id', ingressDomain.canonical_domain_id)
        .maybeSingle()) as { data: MailDomain | null; error: unknown })
    : { data: ingressDomain, error: null };
  if (canonicalDomain.error) throw canonicalDomain.error;
  if (canonicalDomain.data?.status !== 'active') return null;

  return { canonicalDomain: canonicalDomain.data, ingressDomain };
}

function splitRecipient(value: string) {
  const separator = value.lastIndexOf('@');
  if (separator <= 0 || separator === value.length - 1) return null;
  return {
    domain: value.slice(separator + 1).toLowerCase(),
    localPart: value.slice(0, separator).toLowerCase(),
  };
}

export function isCanonicalCloudflareIngress({
  canonicalDomain,
  canonicalRecipient,
  eventDomain,
  ingressDomain,
  observedRecipient,
}: {
  canonicalDomain: string;
  canonicalRecipient: string;
  eventDomain: string;
  ingressDomain: string;
  observedRecipient: string;
}) {
  const canonical = splitRecipient(canonicalRecipient);
  const observed = splitRecipient(observedRecipient);
  return Boolean(
    canonical &&
      observed &&
      eventDomain === canonicalDomain &&
      canonical.domain === canonicalDomain &&
      observed.domain === ingressDomain &&
      canonical.localPart === observed.localPart
  );
}

async function upsertStoredObject(
  admin: AnyRecord,
  object: z.infer<typeof storedObjectSchema>
) {
  const { data, error } = await privateTable(admin, 'mail_stored_objects')
    .upsert(
      {
        bucket_name: object.bucketName,
        content_id: object.contentId,
        content_type: object.contentType,
        filename: object.filename,
        object_key: object.objectKey,
        object_kind: object.objectKind,
        provider: 'r2',
        sha256: object.sha256,
        size_bytes: object.sizeBytes,
      },
      { onConflict: 'provider,bucket_name,object_key' }
    )
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function handleCloudflareInboundEvent(
  event: z.infer<typeof cloudflareInboundEventSchema>
) {
  const admin = await createAdminClient({ noCookie: true });
  const route = await resolveCloudflareDomainRoute(admin, event.domain);

  if (event.type === 'domain_check') {
    const recipient = event.recipient ? splitRecipient(event.recipient) : null;
    const canonicalRecipient =
      route && recipient
        ? `${recipient.localPart}@${route.canonicalDomain.domain}`
        : null;
    const resolved =
      route && canonicalRecipient
        ? await resolveInboundMailbox({
            admin,
            canonicalDomainId: route.canonicalDomain.id,
            canonicalRecipient,
            ingressDomainId: route.ingressDomain.id,
            provisionInternalUser: false,
          })
        : null;
    return {
      accepted: Boolean(route && (!event.recipient || resolved)),
      canonicalDomain: route?.canonicalDomain.domain,
      reason: route
        ? event.recipient && !resolved
          ? 'No active mailbox route matched this recipient'
          : undefined
        : 'Unknown or disabled Cloudflare mail domain',
      route: resolved?.route,
    };
  }
  const ingressDomainName = event.ingressDomain ?? event.domain;
  const ingestRoute =
    ingressDomainName === event.domain
      ? route
      : await resolveCloudflareDomainRoute(admin, ingressDomainName);
  const observedRecipient = event.envelope.observedTo ?? event.envelope.to;
  if (
    !ingestRoute ||
    !isCanonicalCloudflareIngress({
      canonicalDomain: ingestRoute.canonicalDomain.domain,
      canonicalRecipient: event.envelope.to,
      eventDomain: event.domain,
      ingressDomain: ingestRoute.ingressDomain.domain,
      observedRecipient,
    })
  ) {
    return { imported: 0, status: 'domain_unavailable' as const };
  }
  const domain = ingestRoute.canonicalDomain;

  const { data: existingJob, error: existingJobError } = await privateTable(
    admin,
    'mail_inbound_jobs'
  )
    .select('id, status')
    .eq('provider', 'cloudflare')
    .eq('provider_message_id', event.deliveryId)
    .maybeSingle();
  if (existingJobError) throw existingJobError;
  if (existingJob?.status === 'imported') {
    return { imported: 0, status: 'duplicate' as const };
  }

  const rawObject = await upsertStoredObject(admin, event.rawObject);
  const quarantined = Boolean(event.quarantineReason || !event.parsed);
  const { data: job, error: jobError } = await privateTable(
    admin,
    'mail_inbound_jobs'
  )
    .upsert(
      {
        payload: {
          bodyObjects: event.bodyObjects,
          canonicalDomain: domain.domain,
          envelope: event.envelope,
          ingressDomain: ingestRoute.ingressDomain.domain,
          quarantineReason: event.quarantineReason,
        },
        provider: 'cloudflare',
        provider_message_id: event.deliveryId,
        receipt_recipients: [event.envelope.to],
        status: quarantined ? 'quarantined' : 'processing',
        stored_object_id: rawObject.id,
      },
      { onConflict: 'provider,provider_message_id' }
    )
    .select('*')
    .single();
  if (jobError) throw jobError;

  const { data: rawMessage, error: rawError } = await privateTable(
    admin,
    'mail_raw_messages'
  )
    .upsert(
      {
        provider: 'cloudflare',
        provider_message_id: event.deliveryId,
        provider_payload: {
          canonicalDomain: domain.domain,
          envelope: event.envelope,
          ingressDomain: ingestRoute.ingressDomain.domain,
        },
        raw_headers: event.parsed?.headers ?? {},
        sha256: event.rawObject.sha256,
        size_bytes: event.rawObject.sizeBytes,
        status: quarantined ? 'quarantined' : 'imported',
        stored_object_id: rawObject.id,
      },
      { onConflict: 'provider,provider_message_id' }
    )
    .select('*')
    .single();
  if (rawError) throw rawError;

  if (quarantined || !event.parsed) {
    await privateTable(admin, 'mail_inbound_jobs')
      .update({
        error_message: event.quarantineReason ?? 'Malformed MIME',
        processed_at: new Date().toISOString(),
        status: 'quarantined',
      })
      .eq('id', job.id);
    return { imported: 0, status: 'quarantined' as const };
  }

  const resolvedMailbox = await resolveInboundMailbox({
    admin,
    canonicalDomainId: domain.id,
    canonicalRecipient: event.envelope.to,
    ingressDomainId: ingestRoute.ingressDomain.id,
  });
  if (!resolvedMailbox) {
    await privateTable(admin, 'mail_inbound_jobs')
      .update({
        error_message: 'No active mailbox matched the Cloudflare recipient',
        processed_at: new Date().toISOString(),
        status: 'quarantined',
      })
      .eq('id', job.id);
    return { imported: 0, status: 'quarantined' as const };
  }

  const attachmentObjects = await Promise.all(
    event.parsed.attachments.map((attachment) =>
      upsertStoredObject(admin, attachment.storedObject)
    )
  );
  const parsed: ParsedEmail = {
    ...event.parsed,
    attachments: event.parsed.attachments.map((attachment, index) => ({
      contentId: attachment.contentId,
      contentType: attachment.contentType,
      disposition: attachment.disposition,
      filename: attachment.filename,
      sizeBytes: attachment.sizeBytes,
      storedObjectId: attachmentObjects[index]?.id ?? null,
    })),
  };
  const message = await createInboundMessage({
    admin,
    delivery: {
      envelopeFrom: event.envelope.from,
      envelopeTo: event.envelope.to,
      ingressDomainId: ingestRoute.ingressDomain.id,
      observedRecipient,
      route: resolvedMailbox.route,
    },
    mailbox: resolvedMailbox.mailbox,
    parsed,
    provider: 'cloudflare',
    providerMessageId: event.deliveryId,
    rawMessageId: rawMessage.id,
  });

  const relatedObjects = await Promise.all(
    event.bodyObjects.map((object) => upsertStoredObject(admin, object))
  );
  await Promise.all(
    [rawObject, ...attachmentObjects, ...relatedObjects].map((object) =>
      privateTable(admin, 'mail_stored_objects')
        .update({
          mailbox_id: resolvedMailbox.mailbox.id,
          message_id: message.id,
        })
        .eq('id', object.id)
    )
  );

  const allowAutoDraft =
    resolvedMailbox.mailbox.auto_draft_enabled &&
    (resolvedMailbox.route === 'exact' ||
      ingestRoute.ingressDomain.catch_all_auto_draft_enabled);
  if (allowAutoDraft) {
    await privateTable(admin, 'mail_auto_draft_jobs').upsert(
      {
        mailbox_id: resolvedMailbox.mailbox.id,
        message_id: message.id,
        status: 'queued',
      },
      { onConflict: 'mailbox_id,message_id' }
    );
  }

  await privateTable(admin, 'mail_inbound_jobs')
    .update({ processed_at: new Date().toISOString(), status: 'imported' })
    .eq('id', job.id);
  return { imported: 1, status: 'imported' as const };
}
