import type { EmailService } from '@tuturuuu/email-service';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { MailerOutcome, PolicyNoticeMailer } from './types';

/**
 * Sends through the existing EmailService (SES with the root workspace's
 * database credentials, From = the root sender). One recipient per message,
 * multipart HTML + text. The service's own blacklist check always runs. The
 * service is loaded lazily, so a dry run never touches credentials.
 */
export function createEmailServiceMailer(
  load: () => Promise<EmailService>
): PolicyNoticeMailer {
  let service: Promise<EmailService> | null = null;

  return {
    async send(input): Promise<MailerOutcome> {
      service ??= load();
      const result = await (await service).sendInternal({
        recipients: { to: [input.to] },
        content: {
          subject: input.subject,
          html: input.html,
          text: input.text,
          replyTo: input.replyTo,
        },
        metadata: {
          wsId: ROOT_WORKSPACE_ID,
          templateType: 'policy-notice',
          entityType: 'policy_notice',
          entityId: input.noticeId,
          priority: 'high',
        },
      });

      if (result.success && result.messageId)
        return { kind: 'sent', messageId: result.messageId };
      if (
        !result.success &&
        result.error === 'All recipients blocked' &&
        result.blockedRecipients?.length
      )
        return { kind: 'blocked' };
      if (result.deliveryOutcome === 'rejected') return { kind: 'rejected' };
      // Anything else might have been dispatched: record it, never retry it.
      return { kind: 'unknown' };
    },
  };
}
