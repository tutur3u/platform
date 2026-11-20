import { z } from 'zod';
import { publishedFormIdSchema } from '../published-schema';

export const MAX_FORM_UPLOAD_CLAIMS = 20;
export const FORM_RESPONDENT_UPLOAD_BUCKET = 'forms-respondent-uploads';

const reservationSchema = z.object({
  id: publishedFormIdSchema,
  ws_id: publishedFormIdSchema,
  version_id: publishedFormIdSchema,
  launch_id: publishedFormIdSchema,
  question_id: publishedFormIdSchema,
  cleanup_attempts: z.number().int().min(1).max(5).optional(),
});

export type ExpiredFormUpload = z.infer<typeof reservationSchema>;
export type FormUploadCleanupScope = {
  wsId: string;
  formId: string;
  actorScope: string;
};

export function formRespondentUploadKey(reservation: ExpiredFormUpload) {
  const row = reservationSchema.parse(reservation);
  return [
    row.ws_id,
    row.version_id,
    row.launch_id,
    row.question_id,
    row.id,
  ].join('/');
}

type CleanupPorts = {
  mayContinue: () => Promise<boolean>;
  claim: (scope: FormUploadCleanupScope | null) => Promise<unknown>;
  seal: (
    row: ExpiredFormUpload
  ) => Promise<{ reservationId: string; state: 'sealed' }>;
  remove: (key: string) => Promise<void>;
  forget: (row: ExpiredFormUpload) => Promise<void>;
};

export async function cleanClaimedFormUploads(
  ports: CleanupPorts,
  scope: FormUploadCleanupScope | null
) {
  const failedIds: string[] = [];
  let processed = 0;
  if (!(await ports.mayContinue()))
    return { processed, failedIds, stopped: true };
  const reservations = z
    .array(reservationSchema)
    .max(MAX_FORM_UPLOAD_CLAIMS)
    .parse(await ports.claim(scope));
  if (scope && reservations.some(({ ws_id }) => ws_id !== scope.wsId))
    throw new Error('Form upload claim returned another workspace');

  for (const reservation of reservations) {
    if (!(await ports.mayContinue()))
      return { processed, failedIds, stopped: true };
    try {
      const receipt = await ports.seal(reservation);
      if (
        receipt.reservationId !== reservation.id ||
        receipt.state !== 'sealed'
      )
        throw new Error(
          'Form upload write fence did not confirm this reservation'
        );
      if (!(await ports.mayContinue()))
        return { processed, failedIds, stopped: true };
      await ports.remove(formRespondentUploadKey(reservation));
      if (!(await ports.mayContinue()))
        return { processed, failedIds, stopped: true };
      await ports.forget(reservation);
    } catch {
      failedIds.push(reservation.id);
      if (reservation.cleanup_attempts === 5)
        console.warn('Forms upload cleanup exhausted its five attempts');
    }
    processed++;
  }
  return { processed, failedIds, stopped: false };
}

/** Trusted callers run at most one bounded global batch per admitted slot. */
export function runExtendedFormUploadMaintenance(ports: CleanupPorts) {
  return cleanClaimedFormUploads(ports, null);
}
