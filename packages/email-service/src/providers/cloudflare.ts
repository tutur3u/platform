import type {
  CloudflareCredentials,
  EmailAttachment,
  ProviderSendParams,
  ProviderSendResult,
} from '../types';
import { BaseEmailProvider } from './base';

export const CLOUDFLARE_MAX_RECIPIENTS = 50;
export const CLOUDFLARE_MAX_ATTACHMENTS = 32;
export const CLOUDFLARE_MAX_MESSAGE_BYTES = 5 * 1024 * 1024;

type CloudflareApiError = {
  code?: number;
  message?: string;
};

type CloudflareSendResponse = {
  errors?: CloudflareApiError[];
  result?: {
    delivered?: string[];
    message_id?: string;
    permanent_bounces?: string[];
    queued?: string[];
  } | null;
  success?: boolean;
};

function encodeAttachment(attachment: EmailAttachment) {
  return {
    content: Buffer.from(attachment.data).toString('base64'),
    disposition: 'attachment' as const,
    filename: attachment.filename,
    type: attachment.contentType,
  };
}

function utf8Size(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function estimateMessageSize(params: ProviderSendParams) {
  const attachments = params.content.attachments ?? [];
  const headerBytes = Object.entries(params.content.headers ?? {}).reduce(
    (total, [name, value]) => total + utf8Size(name) + utf8Size(value) + 4,
    0
  );
  const attachmentBytes = attachments.reduce(
    (total, attachment) =>
      total +
      Math.ceil(attachment.data.byteLength / 3) * 4 +
      utf8Size(attachment.filename) +
      utf8Size(attachment.contentType) +
      512,
    0
  );

  return (
    utf8Size(params.source) +
    utf8Size(params.content.subject) +
    utf8Size(params.content.html) +
    utf8Size(params.content.text ?? '') +
    headerBytes +
    attachmentBytes +
    16 * 1024
  );
}

function formatApiErrors(errors: CloudflareApiError[] | undefined) {
  if (!errors?.length) return 'Cloudflare Email Service rejected the message';
  return errors
    .map(
      (error) => error.message ?? `Cloudflare error ${error.code ?? 'unknown'}`
    )
    .join('; ');
}

export class CloudflareEmailProvider extends BaseEmailProvider {
  name = 'cloudflare';
  private readonly accountId: string;
  private readonly apiBaseUrl: string;
  private readonly apiToken: string;

  constructor(credentials: CloudflareCredentials) {
    super();
    this.accountId = credentials.accountId.trim();
    this.apiToken = credentials.apiToken.trim();
    this.apiBaseUrl = (
      credentials.apiBaseUrl ?? 'https://api.cloudflare.com/client/v4'
    ).replace(/\/$/u, '');
  }

  async send(params: ProviderSendParams): Promise<ProviderSendResult> {
    const recipientCount =
      params.recipients.to.length +
      (params.recipients.cc?.length ?? 0) +
      (params.recipients.bcc?.length ?? 0);

    if (recipientCount > CLOUDFLARE_MAX_RECIPIENTS) {
      return {
        success: false,
        error: `Cloudflare supports at most ${CLOUDFLARE_MAX_RECIPIENTS} combined recipients`,
      };
    }

    const attachments = params.content.attachments ?? [];
    if (attachments.length > CLOUDFLARE_MAX_ATTACHMENTS) {
      return {
        success: false,
        error: `Cloudflare supports at most ${CLOUDFLARE_MAX_ATTACHMENTS} attachments`,
      };
    }

    try {
      const sanitizedHtml = await this.sanitizeHtml(params.content.html);
      const sanitizedParams = {
        ...params,
        content: { ...params.content, html: sanitizedHtml },
      };
      if (estimateMessageSize(sanitizedParams) > CLOUDFLARE_MAX_MESSAGE_BYTES) {
        return {
          success: false,
          error: 'Cloudflare message exceeds the 5 MiB outbound limit',
        };
      }

      const response = await fetch(
        `${this.apiBaseUrl}/accounts/${encodeURIComponent(this.accountId)}/email/sending/send`,
        {
          body: JSON.stringify({
            attachments: attachments.map(encodeAttachment),
            bcc: params.recipients.bcc,
            cc: params.recipients.cc,
            from: params.source,
            headers: params.content.headers,
            html: sanitizedHtml,
            reply_to: params.content.replyTo,
            subject: params.content.subject,
            text:
              params.content.text ?? this.htmlToPlainText(params.content.html),
            to: params.recipients.to,
          }),
          headers: {
            Authorization: `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        }
      );
      const payload = (await response
        .json()
        .catch(() => null)) as CloudflareSendResponse | null;

      if (!response.ok || !payload?.success || !payload.result) {
        return {
          success: false,
          error: formatApiErrors(payload?.errors),
          httpStatus: response.status,
          rawResponse: payload,
        };
      }

      const permanentBounces = payload.result.permanent_bounces ?? [];
      const accepted = [
        ...(payload.result.delivered ?? []),
        ...(payload.result.queued ?? []),
      ];
      const providerAccepted =
        Boolean(payload.result.message_id) || accepted.length > 0;

      if (permanentBounces.length > 0 || !providerAccepted) {
        return {
          success: false,
          error:
            permanentBounces.length > 0
              ? `Cloudflare permanently bounced ${permanentBounces.length} recipient(s)`
              : 'Cloudflare did not accept any recipients',
          httpStatus: response.status,
          rawResponse: payload,
        };
      }

      return {
        success: true,
        httpStatus: response.status,
        messageId: payload.result.message_id,
        rawResponse: payload,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Cloudflare Email Service request failed',
      };
    }
  }

  async validateCredentials(): Promise<boolean> {
    if (!this.accountId || !this.apiToken) return false;

    try {
      const response = await fetch(`${this.apiBaseUrl}/user/tokens/verify`, {
        headers: { Authorization: `Bearer ${this.apiToken}` },
      });
      if (!response.ok) return false;
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
      } | null;
      return payload?.success === true;
    } catch {
      return false;
    }
  }
}
