import { sendWorkspaceEmail } from '@tuturuuu/email-service';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import type { InvitationMessage, InvitationSendResult } from './delivery';

const encoder = new TextEncoder();

/**
 * Send one invitation through the platform email service. The message is
 * sent from the platform sender identity (root workspace credentials) with
 * Reply-To set to the organizer, and keeps the workspace, user, recipient
 * and invite rate limits, blacklist and email audit of EmailService.
 * Never throws: an exception becomes an `unknown` outcome so the
 * dispatcher does not resend a message that may have gone out.
 */
export async function sendInvitationEmail(
  message: InvitationMessage
): Promise<InvitationSendResult> {
  try {
    const result = await sendWorkspaceEmail(
      message.wsId,
      {
        recipients: { to: [message.to] },
        content: {
          subject: message.subject,
          html: message.html,
          text: message.text,
          replyTo: [message.replyTo],
          headers: {
            'X-Tuturuuu-Delivery': message.deliveryId,
            ...(message.unsubscribeUrl
              ? {
                  'List-Unsubscribe': `<${message.unsubscribeUrl}>`,
                  'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                }
              : {}),
          },
          attachments: [
            {
              filename:
                message.method === 'CANCEL' ? 'cancel.ics' : 'invite.ics',
              contentType: `text/calendar; charset=UTF-8; method=${message.method}`,
              data: encoder.encode(message.ics),
              disposition: 'attachment',
            },
          ],
        },
        metadata: {
          userId: message.requestedBy ?? undefined,
          templateType: 'calendar-event-invitation',
          entityType: 'calendar_invite_delivery',
          entityId: message.deliveryId,
          isInvite: true,
        },
      },
      { credentialWorkspaceId: ROOT_WORKSPACE_ID }
    );

    if (result.success) return { status: 'sent', messageId: result.messageId };

    const blocked = result.blockedRecipients?.[0];
    if (blocked && blocked.reason !== 'rate_limit')
      return { status: 'suppressed', error: blocked.reason };
    if (blocked?.reason === 'rate_limit' || result.rateLimitInfo)
      return { status: 'retry', error: 'rate_limited' };
    if (result.deliveryOutcome === 'unknown')
      return { status: 'unknown', error: result.error ?? 'unknown outcome' };
    if (result.deliveryOutcome === 'rejected')
      return { status: 'failed', error: result.error ?? 'rejected' };
    return { status: 'retry', error: result.error ?? 'send failed' };
  } catch (error) {
    return {
      status: 'unknown',
      error: error instanceof Error ? error.message.slice(0, 200) : 'exception',
    };
  }
}
