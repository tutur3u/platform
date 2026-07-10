import PostalMime, { type Address, type Attachment } from 'postal-mime';

const MAX_INBOUND_BYTES = 25 * 1024 * 1024;

type EmailMessage = {
  from: string;
  headers: Headers;
  raw: ReadableStream<Uint8Array>;
  rawSize: number;
  setReject(reason: string): void;
  to: string;
};

type R2Object = {
  etag: string;
  key: string;
  size: number;
};

type R2Bucket = {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array | string,
    options?: {
      customMetadata?: Record<string, string>;
      httpMetadata?: { contentType?: string };
    }
  ): Promise<R2Object | null>;
};

type Env = {
  MAIL_INGEST_SECRET: string;
  MAIL_INGEST_URL: string;
  MAIL_R2_BUCKET: R2Bucket;
  MAIL_R2_BUCKET_NAME: string;
};

type StoredObject = {
  bucketName: string;
  contentId?: string;
  contentType: string;
  filename?: string;
  objectKey: string;
  objectKind: 'attachment' | 'body' | 'raw_mime';
  sha256: string;
  sizeBytes: number;
};

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

async function sha256(value: ArrayBuffer | Uint8Array | string) {
  const bytes =
    typeof value === 'string'
      ? new TextEncoder().encode(value).buffer
      : value instanceof ArrayBuffer
        ? value
        : Uint8Array.from(value).buffer;
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

async function sign(secret: string, timestamp: string, body: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { hash: 'SHA-256', name: 'HMAC' },
    false,
    ['sign']
  );
  return hex(
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${timestamp}.${body}`)
    )
  );
}

async function signedPost<T>(env: Env, payload: unknown): Promise<T> {
  const body = JSON.stringify(payload);
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = await sign(env.MAIL_INGEST_SECRET, timestamp, body);
      const response = await fetch(env.MAIL_INGEST_URL, {
        body,
        headers: {
          'Content-Type': 'application/json',
          'X-Tuturuuu-Mail-Signature': signature,
          'X-Tuturuuu-Mail-Timestamp': timestamp,
        },
        method: 'POST',
      });
      if (response.ok) return (await response.json()) as T;
      if (response.status !== 429 && response.status < 500) {
        const error = new Error(
          `Mail ingestion endpoint permanently rejected the event with ${response.status}`
        );
        Object.assign(error, { permanent: true });
        throw error;
      }
      lastError = new Error(
        `Mail ingestion endpoint returned transient status ${response.status}`
      );
    } catch (error) {
      if (
        error instanceof Error &&
        'permanent' in error &&
        error.permanent === true
      ) {
        throw error;
      }
      lastError = error;
    }

    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 100 * 4 ** attempt));
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Mail ingestion endpoint request failed');
}

function flattenAddresses(addresses: Address[] | undefined) {
  return (addresses ?? []).flatMap((address) =>
    address.group
      ? address.group.map((entry) => ({
          address: entry.address.toLowerCase(),
          displayName: entry.name || null,
        }))
      : address.address
        ? [
            {
              address: address.address.toLowerCase(),
              displayName: address.name || null,
            },
          ]
        : []
  );
}

function firstAddress(address: Address | undefined) {
  if (!address) return null;
  if (address.group) {
    const first = address.group[0];
    return first
      ? {
          address: first.address.toLowerCase(),
          displayName: first.name || null,
        }
      : null;
  }
  return {
    address: address.address.toLowerCase(),
    displayName: address.name || null,
  };
}

function attachmentBytes(attachment: Attachment) {
  if (attachment.content instanceof ArrayBuffer) {
    return new Uint8Array(attachment.content);
  }
  return new TextEncoder().encode(attachment.content);
}

async function storeObject(
  env: Env,
  object: Omit<StoredObject, 'bucketName' | 'sha256' | 'sizeBytes'>,
  bytes: ArrayBuffer | Uint8Array | string
): Promise<StoredObject> {
  const digest = await sha256(bytes);
  const sizeBytes =
    typeof bytes === 'string'
      ? new TextEncoder().encode(bytes).byteLength
      : bytes.byteLength;
  await env.MAIL_R2_BUCKET.put(object.objectKey, bytes, {
    customMetadata: { sha256: digest },
    httpMetadata: { contentType: object.contentType },
  });
  return {
    ...object,
    bucketName: env.MAIL_R2_BUCKET_NAME,
    sha256: digest,
    sizeBytes,
  };
}

function hasQuarantineSignal(headers: Headers) {
  const spam = headers.get('x-spam-flag')?.toLowerCase();
  const virus = headers.get('x-virus-status')?.toLowerCase();
  return spam === 'yes' || (virus != null && !virus.startsWith('clean'));
}

export default {
  async email(message: EmailMessage, env: Env): Promise<void> {
    const recipient = message.to.trim().toLowerCase();
    const domain = recipient.split('@')[1];
    if (!domain) {
      message.setReject('Invalid recipient');
      return;
    }
    if (message.rawSize > MAX_INBOUND_BYTES) {
      message.setReject('Message exceeds the 25 MiB inbound limit');
      return;
    }

    const domainCheck = await signedPost<{
      accepted: boolean;
      reason?: string;
    }>(env, { domain, type: 'domain_check' });
    if (!domainCheck.accepted) {
      message.setReject(domainCheck.reason ?? 'Mail domain is unavailable');
      return;
    }

    const raw = await new Response(message.raw).arrayBuffer();
    const rawSha = await sha256(raw);
    const deliveryId = await sha256(`${recipient}:${rawSha}`);
    const prefix = `mail/${domain}/${new Date().toISOString().slice(0, 7)}/${deliveryId}`;
    const rawObject = await storeObject(
      env,
      {
        contentType: 'message/rfc822',
        objectKey: `${prefix}/raw.eml`,
        objectKind: 'raw_mime',
      },
      raw
    );

    let parsed: Awaited<ReturnType<typeof PostalMime.parse>>;
    try {
      parsed = await PostalMime.parse(raw, {
        attachmentEncoding: 'arraybuffer',
        maxHeadersSize: 256 * 1024,
        maxNestingDepth: 40,
      });
    } catch {
      await signedPost(env, {
        deliveryId,
        domain,
        envelope: { from: message.from, to: recipient },
        quarantineReason: 'malformed_mime',
        rawObject,
        type: 'ingest',
      });
      return;
    }

    const bodyObjects: StoredObject[] = [];
    if (parsed.text) {
      bodyObjects.push(
        await storeObject(
          env,
          {
            contentType: 'text/plain; charset=utf-8',
            objectKey: `${prefix}/body.txt`,
            objectKind: 'body',
          },
          parsed.text
        )
      );
    }
    if (parsed.html) {
      bodyObjects.push(
        await storeObject(
          env,
          {
            contentType: 'text/html; charset=utf-8',
            objectKey: `${prefix}/body.html`,
            objectKind: 'body',
          },
          parsed.html
        )
      );
    }

    const attachments = await Promise.all(
      parsed.attachments.map(async (attachment, index) => {
        const bytes = attachmentBytes(attachment);
        const storedObject = await storeObject(
          env,
          {
            contentId: attachment.contentId,
            contentType: attachment.mimeType,
            filename: attachment.filename ?? `attachment-${index + 1}`,
            objectKey: `${prefix}/attachments/${index + 1}`,
            objectKind: 'attachment',
          },
          bytes
        );
        return {
          contentId: attachment.contentId ?? null,
          contentType: attachment.mimeType,
          disposition:
            attachment.disposition === 'inline' ? 'inline' : 'attachment',
          filename: attachment.filename ?? `attachment-${index + 1}`,
          sizeBytes: storedObject.sizeBytes,
          storedObject,
        };
      })
    );

    await signedPost(env, {
      bodyObjects,
      deliveryId,
      domain,
      envelope: { from: message.from, to: recipient },
      parsed: {
        attachments,
        bodyHtml: parsed.html ?? null,
        bodyText: parsed.text ?? null,
        cc: flattenAddresses(parsed.cc),
        from: firstAddress(parsed.from),
        headers: Object.fromEntries(
          parsed.headers.map((header) => [header.key, header.value])
        ),
        inReplyTo: parsed.inReplyTo ?? null,
        internetMessageId: parsed.messageId ?? null,
        references: parsed.references?.split(/\s+/u).filter(Boolean) ?? [],
        subject: parsed.subject ?? '(no subject)',
        to: flattenAddresses(parsed.to),
      },
      quarantineReason: hasQuarantineSignal(message.headers)
        ? 'spam_or_virus_signal'
        : null,
      rawObject,
      type: 'ingest',
    });
  },
};
