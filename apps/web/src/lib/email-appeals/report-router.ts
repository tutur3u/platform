import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { Json } from '@tuturuuu/types';
import { z } from 'zod';
import { createAppealSesPort } from '@tuturuuu/email-service/appeal-ses';
import {
  bindingToDatabase,
  parseDatabaseBinding,
} from '@tuturuuu/email-service/appeal-transport';
import {
  reportBindingSchema,
  sendGrantedReport,
  type AppealReportRouter,
} from '@tuturuuu/email-service/appeal-report';
import { readActiveAppealBinding } from './transport';

type ReportSchema = {
  public: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
    Functions: {
      email_appeal_report_grant: {
        Args: { p_ws_id: string; p_email: string };
        Returns: Json;
      };
      email_appeal_claim_report: {
        Args: {
          p_appeal_id: string;
          p_ws_id: string;
          p_email: string;
          p_queue_id: string;
          p_generation: string;
          p_binding: Json;
          p_content_hash: string;
          p_provider_generation: string;
        };
        Returns: Json;
      };
      email_appeal_authorize_report_dispatch: {
        Args: {
          p_dispatch_id: string;
          p_ws_id: string;
          p_email: string;
          p_generation: string;
          p_provider_generation: string;
          p_binding: Json;
        };
        Returns: boolean;
      };
      email_appeal_mark_report: {
        Args: {
          p_dispatch_id: string;
          p_outcome: string;
          p_message_id: string | null;
        };
        Returns: Json;
      };
    };
  };
};
const grantSchema = z.object({
  appeal_id: z.uuid(),
  generation: z.string().min(1),
  provider_generation: z.string().regex(/^[a-f0-9]{64}$/),
  binding: z.unknown(),
  report_binding: reportBindingSchema,
});

export async function createAppealReportRouter(scope: {
  wsId: string;
  recipient: string;
  reportId: string;
  queueId: string;
}): Promise<AppealReportRouter | null> {
  const binding = await readActiveAppealBinding();
  if (!binding) return null;
  const admin = await createAdminClient<ReportSchema>({ noCookie: true });
  const grant = await admin.rpc('email_appeal_report_grant', {
    p_ws_id: scope.wsId,
    p_email: scope.recipient,
  });
  const parsed = grantSchema.safeParse(grant.data);
  if (grant.error || !parsed.success) return null;
  const snapshot = parsed.data;
  const snapshotBinding = parseDatabaseBinding(snapshot.binding);
  if (
    !snapshotBinding ||
    JSON.stringify(bindingToDatabase(snapshotBinding)) !==
      JSON.stringify(bindingToDatabase(binding))
  )
    return null;
  const accessKeyId = process.env.EMAIL_APPEAL_RECOVERY_ACCESS_KEY_ID;
  const secretAccessKey = process.env.EMAIL_APPEAL_RECOVERY_SECRET_ACCESS_KEY;
  const sourceAccessKeyId = process.env.EMAIL_APPEAL_SOURCE_ACCESS_KEY_ID;
  const sourceSecretAccessKey =
    process.env.EMAIL_APPEAL_SOURCE_SECRET_ACCESS_KEY;
  if (
    !accessKeyId ||
    !secretAccessKey ||
    !sourceAccessKeyId ||
    !sourceSecretAccessKey
  )
    return null;
  const source = createAppealSesPort({
    region: binding.sourceRegion,
    credentials: {
      accessKeyId: sourceAccessKeyId,
      secretAccessKey: sourceSecretAccessKey,
    },
  });
  const recovery = createAppealSesPort({
    region: binding.region,
    credentials: { accessKeyId, secretAccessKey },
  });
  const isActive = async () => {
    const active = await readActiveAppealBinding();
    if (
      !active ||
      JSON.stringify(bindingToDatabase(active)) !==
        JSON.stringify(bindingToDatabase(binding))
    )
      return false;
    const current = await admin.rpc('email_appeal_report_grant', {
      p_ws_id: scope.wsId,
      p_email: scope.recipient,
    });
    return (
      !current.error &&
      JSON.stringify(current.data) === JSON.stringify(grant.data)
    );
  };
  return async (input) => {
    if (
      input.metadata.wsId !== scope.wsId ||
      input.metadata.entityId !== scope.reportId ||
      input.recipients.to.length !== 1 ||
      input.recipients.to[0]?.toLowerCase() !== scope.recipient ||
      (input.recipients.cc?.length ?? 0) !== 0 ||
      (input.recipients.bcc?.length ?? 0) !== 0
    ) {
      return {
        success: false,
        error: 'Report recipient binding changed',
        deliveryOutcome: 'rejected',
      };
    }
    return sendGrantedReport(input, {
      binding,
      reportBinding: snapshot.report_binding,
      appealId: snapshot.appeal_id,
      queueId: scope.queueId,
      generation: snapshot.generation,
      expectedProviderGeneration: snapshot.provider_generation,
      source,
      recovery,
      isActive,
      async claim(contentHash, providerGeneration) {
        const result = await admin.rpc('email_appeal_claim_report', {
          p_appeal_id: snapshot.appeal_id,
          p_ws_id: scope.wsId,
          p_email: scope.recipient,
          p_queue_id: scope.queueId,
          p_generation: snapshot.generation,
          p_binding: snapshot.report_binding,
          p_content_hash: contentHash,
          p_provider_generation: providerGeneration,
        });
        const row = z
          .object({ status: z.literal('dispatching'), id: z.uuid() })
          .safeParse(result.data);
        return !result.error && row.success ? row.data.id : null;
      },
      async authorize(id, providerGeneration) {
        const result = await admin.rpc(
          'email_appeal_authorize_report_dispatch',
          {
            p_dispatch_id: id,
            p_ws_id: scope.wsId,
            p_email: scope.recipient,
            p_generation: snapshot.generation,
            p_provider_generation: providerGeneration,
            p_binding: snapshot.report_binding,
          }
        );
        return !result.error && result.data === true;
      },
      async record(id, status, messageId) {
        const result = await admin.rpc('email_appeal_mark_report', {
          p_dispatch_id: id,
          p_outcome: status,
          p_message_id: messageId ?? null,
        });
        if (result.error) throw new Error('Report delivery record unavailable');
      },
    });
  };
}
