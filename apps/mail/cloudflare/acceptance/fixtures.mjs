import { createHmac } from 'node:crypto';
import { sha256 } from './evidence.mjs';

// 1x1 PNG, used for the inline CID image and the pasted-image shapes.
export const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const stored = (
  bucketName,
  objectKey,
  objectKind,
  contentType,
  bytes,
  more
) => ({
  bucketName,
  objectKey,
  objectKind,
  contentType,
  sha256: sha256(bytes),
  sizeBytes: bytes.length,
  ...more,
});

function rawMime({ from, to, subject, messageId }) {
  return Buffer.from(
    [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      `Message-ID: ${messageId}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      '',
      'acceptance fixture',
      '',
    ].join('\r\n')
  );
}

/**
 * Three inbound messages as the Email Routing Worker would report them: plain
 * text, HTML with an inline CID image, and one file attachment. Every stored
 * object is returned with its bytes so the caller seeds the object store.
 */
export function buildInboundFixtures({ runId, domain, mailbox, bucket }) {
  const sender = `acceptance-sender@${domain}`;
  const attachmentBytes = Buffer.from(`acceptance attachment ${runId}\n`);
  const contentId = `acceptance-logo-${runId}@acceptance.invalid`;
  const defs = [
    {
      key: 'plain',
      subject: `D394 plain ${runId}`,
      bodyText: `Plain acceptance body ${runId}`,
      bodyHtml: null,
      attachments: [],
    },
    {
      key: 'cid',
      subject: `D394 cid ${runId}`,
      bodyText: `Inline image acceptance ${runId}`,
      bodyHtml: `<p>Inline image ${runId}</p><img src="cid:${contentId}" alt="logo">`,
      attachments: [
        {
          contentId,
          contentType: 'image/png',
          disposition: 'inline',
          filename: 'logo.png',
          bytes: PNG_BYTES,
        },
      ],
    },
    {
      key: 'file',
      subject: `D394 file ${runId}`,
      bodyText: `Attachment acceptance ${runId}`,
      bodyHtml: null,
      attachments: [
        {
          contentId: null,
          contentType: 'text/plain',
          disposition: 'attachment',
          filename: 'report.txt',
          bytes: attachmentBytes,
        },
      ],
    },
  ];
  return defs.map((def, index) => {
    const messageId = `<${runId}-${index}@acceptance.invalid>`;
    const raw = rawMime({
      from: sender,
      to: mailbox,
      subject: def.subject,
      messageId,
    });
    const prefix = `acceptance/${runId}/${def.key}`;
    const rawObject = stored(
      bucket,
      `${prefix}/raw.eml`,
      'raw_mime',
      'message/rfc822',
      raw
    );
    const objects = [{ ...rawObject, bytes: raw }];
    const attachments = def.attachments.map((attachment) => {
      const storedObject = stored(
        bucket,
        `${prefix}/${attachment.filename}`,
        'attachment',
        attachment.contentType,
        attachment.bytes,
        {
          filename: attachment.filename,
          ...(attachment.contentId ? { contentId: attachment.contentId } : {}),
        }
      );
      objects.push({ ...storedObject, bytes: attachment.bytes });
      return {
        contentId: attachment.contentId,
        contentType: attachment.contentType,
        disposition: attachment.disposition,
        filename: attachment.filename,
        sizeBytes: attachment.bytes.length,
        storedObject,
      };
    });
    return {
      key: def.key,
      subject: def.subject,
      rawSha256: rawObject.sha256,
      objects,
      attachments: def.attachments,
      event: {
        type: 'ingest',
        deliveryId: sha256(`${runId}:${def.key}`),
        domain,
        envelope: { from: sender, to: mailbox },
        bodyObjects: [],
        rawObject,
        parsed: {
          attachments,
          bodyHtml: def.bodyHtml,
          bodyText: def.bodyText,
          cc: [],
          from: { address: sender, displayName: 'Acceptance Sender' },
          headers: {},
          inReplyTo: null,
          internetMessageId: messageId,
          references: [],
          subject: def.subject,
          to: [{ address: mailbox, displayName: null }],
        },
      },
    };
  });
}

/** Signs a webhook body the way the Email Routing Worker does. */
export function signWebhook(secret, body, now = Date.now()) {
  const timestamp = String(Math.floor(now / 1000));
  return {
    'content-type': 'application/json',
    'x-tuturuuu-mail-timestamp': timestamp,
    'x-tuturuuu-mail-signature': createHmac('sha256', secret)
      .update(`${timestamp}.${body}`)
      .digest('hex'),
  };
}
