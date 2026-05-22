/**
 * AWS SES Email Provider
 *
 * Implementation of email provider using Amazon Simple Email Service (SES).
 */

import {
  GetSendQuotaCommand,
  SESClient,
  SendEmailCommand,
  SendRawEmailCommand,
} from '@aws-sdk/client-ses';

import { SES_DEFAULT_REGION } from '../constants';
import type {
  EmailAttachment,
  ProviderSendParams,
  ProviderSendResult,
  SESCredentials,
} from '../types';
import { BaseEmailProvider } from './base';

function chunkBase64(value: string) {
  return value.match(/.{1,76}/g)?.join('\r\n') ?? '';
}

function encodeBase64(value: string | Uint8Array) {
  return Buffer.from(value).toString('base64');
}

function encodeMimeHeader(value: string) {
  return `=?UTF-8?B?${encodeBase64(value)}?=`;
}

function sanitizeHeaderValue(value: string) {
  return value.replaceAll(/[\r\n]/g, ' ').trim();
}

function sanitizeBoundary(value: string) {
  return value.replaceAll(/[^A-Za-z0-9=_-]/g, '');
}

function sanitizeFilename(value: string) {
  return sanitizeHeaderValue(value).replaceAll(/["\\]/g, '_');
}

function buildTextPart({
  boundary,
  content,
  contentType,
}: {
  boundary: string;
  content: string;
  contentType: 'text/html' | 'text/plain';
}) {
  return [
    `--${boundary}`,
    `Content-Type: ${contentType}; charset=UTF-8`,
    'Content-Transfer-Encoding: base64',
    '',
    chunkBase64(encodeBase64(content)),
  ].join('\r\n');
}

function buildAttachmentPart(boundary: string, attachment: EmailAttachment) {
  const filename = sanitizeFilename(attachment.filename);

  return [
    `--${boundary}`,
    `Content-Type: ${attachment.contentType}`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    chunkBase64(encodeBase64(attachment.data)),
  ].join('\r\n');
}

function buildRawMimeMessage({
  html,
  params,
  plainText,
}: {
  html: string;
  params: ProviderSendParams;
  plainText: string;
}) {
  const mixedBoundary = sanitizeBoundary(
    `mixed-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const alternativeBoundary = sanitizeBoundary(
    `alt-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  const attachments = params.content.attachments ?? [];
  const recipients = [
    ...params.recipients.to,
    ...(params.recipients.cc ?? []),
    ...(params.recipients.bcc ?? []),
  ];

  const headers = [
    `From: ${sanitizeHeaderValue(params.source)}`,
    `To: ${params.recipients.to.map(sanitizeHeaderValue).join(', ')}`,
    params.recipients.cc?.length
      ? `Cc: ${params.recipients.cc.map(sanitizeHeaderValue).join(', ')}`
      : null,
    params.content.replyTo?.length
      ? `Reply-To: ${params.content.replyTo.map(sanitizeHeaderValue).join(', ')}`
      : null,
    `Subject: ${encodeMimeHeader(params.content.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
  ].filter(Boolean);

  const alternativePart = [
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    '',
    buildTextPart({
      boundary: alternativeBoundary,
      content: plainText,
      contentType: 'text/plain',
    }),
    buildTextPart({
      boundary: alternativeBoundary,
      content: html,
      contentType: 'text/html',
    }),
    `--${alternativeBoundary}--`,
  ].join('\r\n');

  const rawMessage = [
    ...headers,
    '',
    alternativePart,
    ...attachments.map((attachment) =>
      buildAttachmentPart(mixedBoundary, attachment)
    ),
    `--${mixedBoundary}--`,
    '',
  ].join('\r\n');

  return {
    destinations: recipients,
    message: new TextEncoder().encode(rawMessage),
  };
}

export class SESEmailProvider extends BaseEmailProvider {
  name = 'ses';
  private client: SESClient;

  constructor(credentials: SESCredentials) {
    super();
    this.client = new SESClient({
      region: credentials.region || SES_DEFAULT_REGION,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
    });
  }

  /**
   * Send an email via AWS SES.
   */
  async send(params: ProviderSendParams): Promise<ProviderSendResult> {
    try {
      // Sanitize HTML content
      const sanitizedHtml = await this.sanitizeHtml(params.content.html);

      // Generate plain text if not provided
      const plainText =
        params.content.text || this.htmlToPlainText(params.content.html);

      if (params.content.attachments?.length) {
        const rawMessage = buildRawMimeMessage({
          html: sanitizedHtml,
          params,
          plainText,
        });
        const command = new SendRawEmailCommand({
          Source: params.source,
          Destinations: rawMessage.destinations,
          RawMessage: {
            Data: rawMessage.message,
          },
        });
        const response = await this.client.send(command);
        const success = response.$metadata.httpStatusCode === 200;

        if (success) {
          console.log('[SESEmailProvider] Raw email sent successfully:', {
            messageId: response.MessageId,
            to: params.recipients.to,
            subject: params.content.subject,
          });
        }

        return {
          success,
          messageId: response.MessageId,
          httpStatus: response.$metadata.httpStatusCode,
          rawResponse: response,
        };
      }

      // Build the SES command
      const command = new SendEmailCommand({
        Source: params.source,
        Destination: {
          ToAddresses:
            params.recipients.to.length > 0 ? params.recipients.to : undefined,
          CcAddresses:
            params.recipients.cc && params.recipients.cc.length > 0
              ? params.recipients.cc
              : undefined,
          BccAddresses:
            params.recipients.bcc && params.recipients.bcc.length > 0
              ? params.recipients.bcc
              : undefined,
        },
        Message: {
          Subject: {
            Data: params.content.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: sanitizedHtml,
              Charset: 'UTF-8',
            },
            Text: {
              Data: plainText,
              Charset: 'UTF-8',
            },
          },
        },
        ReplyToAddresses: params.content.replyTo,
      });

      // Send the email
      const response = await this.client.send(command);

      const success = response.$metadata.httpStatusCode === 200;

      if (success) {
        console.log('[SESEmailProvider] Email sent successfully:', {
          messageId: response.MessageId,
          to: params.recipients.to,
          subject: params.content.subject,
        });
      }

      return {
        success,
        messageId: response.MessageId,
        httpStatus: response.$metadata.httpStatusCode,
        rawResponse: response,
      };
    } catch (error) {
      console.error('[SESEmailProvider] Error sending email:', error);

      const errorMessage =
        error instanceof Error ? error.message : 'Unknown SES error';

      // Check for specific SES errors
      if (error instanceof Error) {
        if (error.name === 'MessageRejected') {
          return {
            success: false,
            error: `Email rejected: ${errorMessage}`,
          };
        }
        if (error.name === 'MailFromDomainNotVerifiedException') {
          return {
            success: false,
            error: 'Sender domain not verified in SES',
          };
        }
        if (error.name === 'ConfigurationSetDoesNotExistException') {
          return {
            success: false,
            error: 'SES configuration set not found',
          };
        }
        if (error.name === 'AccountSendingPausedException') {
          return {
            success: false,
            error: 'SES account sending is paused',
          };
        }
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Validate SES credentials by checking send quota.
   */
  async validateCredentials(): Promise<boolean> {
    try {
      const command = new GetSendQuotaCommand({});
      const response = await this.client.send(command);

      // Check if we got a valid response
      const isValid =
        response.$metadata.httpStatusCode === 200 &&
        typeof response.Max24HourSend === 'number';

      if (isValid) {
        console.log('[SESEmailProvider] Credentials validated:', {
          max24HourSend: response.Max24HourSend,
          maxSendRate: response.MaxSendRate,
          sentLast24Hours: response.SentLast24Hours,
        });
      }

      return isValid;
    } catch (error) {
      console.error('[SESEmailProvider] Credential validation failed:', error);
      return false;
    }
  }

  /**
   * Get current SES send quota information.
   */
  async getSendQuota(): Promise<{
    max24HourSend: number;
    maxSendRate: number;
    sentLast24Hours: number;
  } | null> {
    try {
      const command = new GetSendQuotaCommand({});
      const response = await this.client.send(command);

      return {
        max24HourSend: response.Max24HourSend || 0,
        maxSendRate: response.MaxSendRate || 0,
        sentLast24Hours: response.SentLast24Hours || 0,
      };
    } catch (error) {
      console.error('[SESEmailProvider] Error getting send quota:', error);
      return null;
    }
  }
}
