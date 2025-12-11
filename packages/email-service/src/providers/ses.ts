/**
 * AWS SES Email Provider
 *
 * Implementation of email provider using Amazon Simple Email Service (SES).
 */

import {
  GetSendQuotaCommand,
  SESClient,
  SendEmailCommand,
} from '@aws-sdk/client-ses';

import { SES_DEFAULT_REGION } from '../constants';
import type {
  ProviderSendParams,
  ProviderSendResult,
  SESCredentials,
} from '../types';
import { BaseEmailProvider } from './base';

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
