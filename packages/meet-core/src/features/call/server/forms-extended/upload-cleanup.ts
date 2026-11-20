import {
  cleanupExpiredFormUploadReservations,
  sweepExpiredFormUploadReservations,
} from './forms-source';
import {
  type ExtendedFormsDependencies,
  readExtendedFormPublication,
} from './operations';

type CleanupDependencies = Pick<
  Parameters<typeof cleanupExpiredFormUploadReservations>[0],
  'supabase' | 'fenceStorageWrites'
>;

export type ExtendedFormStorageFence =
  CleanupDependencies['fenceStorageWrites'];

export async function cleanupExtendedFormRespondentUploads({
  context,
  launchId,
  forms,
  resolveActorScope,
  ...cleanup
}: CleanupDependencies & {
  context: Parameters<typeof readExtendedFormPublication>[0];
  launchId: string;
  forms: ExtendedFormsDependencies;
  resolveActorScope: (scope: { wsId: string; formId: string }) => string;
}) {
  const result = await readExtendedFormPublication(context, launchId, forms);
  if (result.status !== 'ok') return result;
  const { formId } = result.publication;
  const scope = { wsId: context.wsId, formId };
  const actorScope = resolveActorScope(scope);
  const outcome = await cleanupExpiredFormUploadReservations({
    ...cleanup,
    resolveScope: async () => ({ ...scope, actorScope }),
  });
  return {
    status: 'ok',
    processed: outcome.processed,
    failed: outcome.failedIds.length,
  } as const;
}

/** Trusted maintenance entry. Each invocation requests one bounded global claim. */
export function runExtendedFormUploadMaintenance(cleanup: CleanupDependencies) {
  return sweepExpiredFormUploadReservations(cleanup);
}
