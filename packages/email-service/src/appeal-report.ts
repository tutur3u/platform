import { createHash } from 'node:crypto';
import { SendEmailCommand } from '@aws-sdk/client-sesv2';
import { z } from 'zod';
import type { AppealSesPort } from './appeal-ses';
import { createSesAppealTransport } from './appeal-ses';
import type { AppealBinding } from './appeal-transport';
import type {
  ProviderSendParams,
  ProviderSendResult,
  EmailMetadata,
} from './types';

export const reportBindingSchema = z
  .object({
    account_id: z.string().regex(/^\d{12}$/),
    region: z.string(),
    identity: z.email(),
    configuration_set: z.string().min(1).max(64),
    ip_pool: z.string().min(1).max(64),
    purpose: z.literal('workspace_report'),
  })
  .strict();
export type ReportBinding = z.infer<typeof reportBindingSchema>;
export type AppealReportRouter = (
  input: ProviderSendParams & { metadata: EmailMetadata }
) => Promise<ProviderSendResult>;

export async function sendGrantedReport(
  input: ProviderSendParams & { metadata: EmailMetadata },
  context: {
    binding: AppealBinding;
    reportBinding: ReportBinding;
    appealId: string;
    queueId: string;
    generation: string;
    expectedProviderGeneration: string;
    source: AppealSesPort;
    recovery: AppealSesPort;
    isActive(): Promise<boolean>;
    claim(
      contentHash: string,
      providerGeneration: string
    ): Promise<string | null>;
    authorize(id: string, providerGeneration: string): Promise<boolean>;
    record(
      id: string,
      status: 'sent' | 'failed' | 'unknown' | 'reblocked',
      messageId?: string
    ): Promise<void>;
  }
): Promise<ProviderSendResult> {
  const denied: ProviderSendResult = {
    success: false,
    error: 'Workspace report transport unavailable',
    deliveryOutcome: 'rejected',
  };
  const recipients = [
    ...input.recipients.to,
    ...(input.recipients.cc ?? []),
    ...(input.recipients.bcc ?? []),
  ];
  const target = recipients[0];
  const report = context.reportBinding;
  if (
    !target ||
    recipients.length !== 1 ||
    input.metadata.templateType !== 'periodic-user-report' ||
    input.metadata.entityType !== 'periodic-report' ||
    !z.uuid().safeParse(input.metadata.entityId).success ||
    report.account_id !== context.binding.accountId ||
    report.region !== context.binding.region ||
    report.configuration_set === context.binding.configurationSet ||
    report.identity === context.binding.identity ||
    (input.content.attachments?.length ?? 0) !== 0
  )
    return denied;
  const routeBinding: AppealBinding = {
    ...context.binding,
    identity: report.identity,
    configurationSet: report.configuration_set,
    ipPool: report.ip_pool,
  };
  const lookup = createSesAppealTransport(routeBinding, {
    source: context.source,
    recovery: context.recovery,
    isActive: context.isActive,
    authorizeDispatch: async () => false,
  });
  if (!(await context.isActive())) return denied;
  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        source: input.source,
        recipients: input.recipients,
        content: input.content,
        metadata: input.metadata,
      })
    )
    .digest('hex');
  const id = await context.claim(digest, context.expectedProviderGeneration);
  if (!id) return denied;
  const before = await lookup.lookupSuppression(target);
  if (before.status !== 'eligible') {
    await context.record(
      id,
      before.status === 'blocked' ? 'reblocked' : 'failed'
    );
    return denied;
  }
  if (before.generation !== context.expectedProviderGeneration) {
    await context.record(id, 'reblocked');
    return denied;
  }
  const after = await lookup.lookupSuppression(target);
  if (
    after.status !== 'eligible' ||
    after.generation !== before.generation ||
    !(await context.authorize(id, after.generation)) ||
    !(await context.isActive())
  ) {
    await context.record(
      id,
      after.status === 'blocked' ||
        (after.status === 'eligible' && after.generation !== before.generation)
        ? 'reblocked'
        : 'failed'
    );
    return denied;
  }
  const headers = Object.entries(input.content.headers ?? {});
  if (
    headers.some(
      ([name, value]) =>
        !['list-unsubscribe', 'list-unsubscribe-post'].includes(
          name.toLowerCase()
        ) || /[\r\n]/.test(value)
    )
  ) {
    await context.record(id, 'failed');
    return denied;
  }
  try {
    const result = await context.recovery.send(
      new SendEmailCommand({
        FromEmailAddress: report.identity,
        ConfigurationSetName: report.configuration_set,
        Destination: { ToAddresses: [target] },
        ReplyToAddresses: input.content.replyTo,
        EmailTags: [
          { Name: 'appeal_id', Value: context.appealId },
          { Name: 'workspace_id', Value: input.metadata.wsId },
          { Name: 'appeal_dispatch_id', Value: id },
          { Name: 'appeal_dispatch_kind', Value: 'report' },
        ],
        Content: {
          Simple: {
            Subject: { Data: input.content.subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: input.content.html, Charset: 'UTF-8' },
              ...(input.content.text
                ? { Text: { Data: input.content.text, Charset: 'UTF-8' } }
                : {}),
            },
            Headers: headers.map(([Name, Value]) => ({ Name, Value })),
          },
        },
      })
    );
    const parsed = z
      .object({ MessageId: z.string().min(1).max(200) })
      .safeParse(result);
    if (!parsed.success) {
      await context.record(id, 'unknown');
      return { success: false, deliveryOutcome: 'unknown' };
    }
    await context.record(id, 'sent', parsed.data.MessageId);
    return {
      success: true,
      deliveryOutcome: 'accepted',
      messageId: parsed.data.MessageId,
    };
  } catch {
    await context.record(id, 'unknown').catch(() => undefined);
    return { success: false, deliveryOutcome: 'unknown' };
  }
}
