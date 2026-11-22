import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database } from '@tuturuuu/types';
import { safeLogUuid } from '@tuturuuu/utils/log-safety';
import { updateAuditRecord } from './email-audit';
import type {
  BlockedRecipient,
  EmailProvider,
  EmailSource,
  SendEmailParams,
  SendEmailResult,
} from './types';

export async function completeEmailDelivery({
  provider,
  supabase,
  source,
  recipients,
  content,
  auditId,
  blockedRecipients,
  shouldSkipSending,
  internal,
}: {
  provider: EmailProvider;
  supabase: SupabaseClient<Database>;
  source: EmailSource;
  recipients: Required<SendEmailParams['recipients']>;
  content: SendEmailParams['content'];
  auditId: string | null;
  blockedRecipients: BlockedRecipient[];
  shouldSkipSending: boolean;
  internal: boolean;
}): Promise<SendEmailResult> {
  const auditFields = {
    auditId: auditId || undefined,
    blockedRecipients: blockedRecipients.length ? blockedRecipients : undefined,
  };

  if (shouldSkipSending) {
    console.log(
      internal
        ? '[EmailService] DEV_MODE (internal) - email logged but NOT sent:'
        : '[EmailService] DEV_MODE - email logged but NOT sent:',
      {
        toCount: recipients.to.length,
        ccCount: recipients.cc.length,
        bccCount: recipients.bcc.length,
        auditId: safeLogUuid(auditId),
      }
    );

    if (auditId)
      await updateAuditRecord(supabase, auditId, 'sent', 'dev-mode-skip');

    return { success: true, messageId: 'dev-mode-skip', ...auditFields };
  }

  const result = await provider.send({
    source: '"' + source.name + '" <' + source.email + '>',
    recipients,
    content,
  });

  if (auditId) {
    if (result.success) {
      await updateAuditRecord(supabase, auditId, 'sent', result.messageId);
    } else {
      await updateAuditRecord(
        supabase,
        auditId,
        'failed',
        undefined,
        result.error
      );
    }
  }

  return {
    deliveryOutcome: result.deliveryOutcome,
    success: result.success,
    messageId: result.messageId,
    error: result.error,
    ...auditFields,
  };
}
