import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database } from '@tuturuuu/types';
import { z } from 'zod';
import { publishedFormIdSchema } from '../published-schema';
import { getPrivateFormsClient, runUntypedRpc } from './client';
import {
  cleanClaimedFormUploads,
  type ExpiredFormUpload,
  FORM_RESPONDENT_UPLOAD_BUCKET,
  runExtendedFormUploadMaintenance,
} from './respondent-upload-maintenance';

export {
  FORM_RESPONDENT_UPLOAD_BUCKET,
  formRespondentUploadKey,
} from './respondent-upload-maintenance';

const uploadCleanupScopeSchema = z.object({
  wsId: publishedFormIdSchema,
  formId: publishedFormIdSchema,
  actorScope: z.string().regex(/^[0-9a-f]{64}$/),
});

type CleanupDependencies = {
  supabase: SupabaseClient<Database>;
  fenceStorageWrites: (
    reservation: ExpiredFormUpload
  ) => Promise<{ reservationId: string; state: 'sealed' }>;
};

function cleanupPorts({ supabase, fenceStorageWrites }: CleanupDependencies) {
  return {
    mayContinue: async () => true,
    claim: (scope: z.infer<typeof uploadCleanupScopeSchema> | null) =>
      runUntypedRpc<unknown>(
        supabase,
        'claim_expired_form_respondent_uploads',
        {
          p_form_id: scope?.formId ?? null,
          p_actor_scope: scope?.actorScope ?? null,
        }
      ),
    seal: fenceStorageWrites,
    async remove(key: string) {
      const { error } = await supabase.storage
        .from(FORM_RESPONDENT_UPLOAD_BUCKET)
        .remove([key]);
      if (error) throw new Error(error.message);
    },
    async forget(reservation: ExpiredFormUpload) {
      const { error } = await getPrivateFormsClient(supabase)
        .from('form_respondent_uploads')
        .delete()
        .eq('id', reservation.id)
        .eq('ws_id', reservation.ws_id)
        .eq('version_id', reservation.version_id)
        .eq('launch_id', reservation.launch_id)
        .eq('question_id', reservation.question_id)
        .not('cleanup_started_at', 'is', null)
        .is('ready_at', null);
      if (error) throw new Error(error.message);
    },
  };
}

export async function cleanupExpiredFormUploadReservations({
  resolveScope,
  ...dependencies
}: CleanupDependencies & {
  resolveScope: () => Promise<z.infer<typeof uploadCleanupScopeSchema>>;
}) {
  const scope = uploadCleanupScopeSchema.parse(await resolveScope());
  return cleanClaimedFormUploads(cleanupPorts(dependencies), scope);
}

export async function sweepExpiredFormUploadReservations(
  dependencies: CleanupDependencies
) {
  const { processed, failedIds } = await runExtendedFormUploadMaintenance(
    cleanupPorts(dependencies)
  );
  return { processed, failedIds };
}
