import type {
  ParsedEmail,
  ParsedEmailAddress,
  ParsedEmailAttachment,
} from './types';

export function normalizeAddress(value: string) {
  const match = value.match(/<([^>]+)>/u);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function parseAddressList(value: string | null | undefined) {
  if (!value) return [];

  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry): ParsedEmailAddress => {
      const match = entry.match(/^\s*(?:"?([^"<]*)"?)?\s*<([^>]+)>\s*$/u);
      if (!match) {
        return { address: normalizeAddress(entry), displayName: null };
      }

      return {
        address: normalizeAddress(match[2] ?? entry),
        displayName: match[1]?.trim() || null,
      };
    });
}

function parseHeaders(rawHeaders: string) {
  const headers: Record<string, string> = {};
  const unfolded = rawHeaders.replaceAll(/\r?\n[ \t]+/gu, ' ');

  for (const line of unfolded.split(/\r?\n/u)) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    headers[key] = headers[key] ? `${headers[key]}, ${value}` : value;
  }

  return headers;
}

function getBoundary(contentType: string | undefined) {
  return contentType?.match(/boundary="?([^";]+)"?/iu)?.[1] ?? null;
}

function decodeTransferBody(body: string, transferEncoding?: string) {
  const encoding = transferEncoding?.toLowerCase();

  if (encoding === 'base64') {
    return Buffer.from(body.replaceAll(/\s+/gu, ''), 'base64').toString('utf8');
  }

  if (encoding === 'quoted-printable') {
    return body
      .replaceAll(/=\r?\n/gu, '')
      .replaceAll(/=([A-F0-9]{2})/giu, (_, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16))
      );
  }

  return body.trim();
}

function parseMultipartBody({
  body,
  boundary,
}: {
  body: string;
  boundary: string;
}) {
  const parts = body
    .split(`--${boundary}`)
    .map((part) => part.trim())
    .filter((part) => part && part !== '--');
  let bodyHtml: string | null = null;
  let bodyText: string | null = null;
  const attachments: ParsedEmailAttachment[] = [];

  for (const part of parts) {
    const separator = part.search(/\r?\n\r?\n/u);
    if (separator < 0) continue;
    const headers = parseHeaders(part.slice(0, separator));
    const content = part.slice(separator).replace(/^\r?\n\r?\n?/u, '');
    const contentType = headers['content-type'] ?? 'text/plain';
    const disposition = headers['content-disposition'] ?? '';
    const decoded = decodeTransferBody(
      content,
      headers['content-transfer-encoding']
    );

    if (/attachment|inline/iu.test(disposition)) {
      attachments.push({
        contentId: headers['content-id']?.replace(/[<>]/gu, '') ?? null,
        contentType:
          contentType.split(';')[0]?.trim() || 'application/octet-stream',
        disposition: /inline/iu.test(disposition) ? 'inline' : 'attachment',
        filename:
          disposition.match(/filename="?([^";]+)"?/iu)?.[1] ??
          contentType.match(/name="?([^";]+)"?/iu)?.[1] ??
          'attachment',
        sizeBytes: Buffer.byteLength(content),
      });
      continue;
    }

    if (contentType.toLowerCase().startsWith('text/html') && !bodyHtml) {
      bodyHtml = decoded;
    } else if (
      contentType.toLowerCase().startsWith('text/plain') &&
      !bodyText
    ) {
      bodyText = decoded;
    }
  }

  return { attachments, bodyHtml, bodyText };
}

export function parseRawEmail(rawEmail: string): ParsedEmail {
  const separator = rawEmail.search(/\r?\n\r?\n/u);
  const rawHeaders = separator >= 0 ? rawEmail.slice(0, separator) : rawEmail;
  const body = separator >= 0 ? rawEmail.slice(separator).trimStart() : '';
  const headers = parseHeaders(rawHeaders);
  const contentType = headers['content-type'];
  const boundary = getBoundary(contentType);
  const multipart = boundary
    ? parseMultipartBody({ body, boundary })
    : {
        attachments: [],
        bodyHtml: contentType?.toLowerCase().startsWith('text/html')
          ? decodeTransferBody(body, headers['content-transfer-encoding'])
          : null,
        bodyText: !contentType?.toLowerCase().startsWith('text/html')
          ? decodeTransferBody(body, headers['content-transfer-encoding'])
          : null,
      };

  return {
    attachments: multipart.attachments,
    bodyHtml: multipart.bodyHtml,
    bodyText: multipart.bodyText,
    cc: parseAddressList(headers.cc),
    from: parseAddressList(headers.from)[0] ?? null,
    headers,
    inReplyTo: headers['in-reply-to'] ?? null,
    internetMessageId: headers['message-id'] ?? null,
    references: headers.references?.split(/\s+/u).filter(Boolean) ?? [],
    subject: headers.subject ?? '(no subject)',
    to: parseAddressList(headers.to),
  };
}
