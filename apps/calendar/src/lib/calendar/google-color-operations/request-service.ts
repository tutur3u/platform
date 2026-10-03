import { createHash, randomUUID } from 'node:crypto';
import type { GoogleProviderColorChoice } from '@tuturuuu/types/primitives/google-calendar-color';
import { decryptEventFromStorage } from '../../workspace-encryption';
import { createColorOperationExecutor } from './execute';
import { createGoogleColorOperationProvider } from './google-provider';
import {
  createPostgresColorOperationRepository,
  inspectPostgresColorOperation,
} from './postgres-repository';
import { ColorOperationError } from './protocol';
import { createRequestColorOperationAccess } from './request-access';

/** Unpublished integration service: callers must guard every competing writer
 * before enabling reserve. Reconciliation never replaces an existing intent. */
export async function createRequestColorOperationService(
  request: Request,
  rawWsId: string,
  eventId: string
) {
  const access = createRequestColorOperationAccess(request, rawWsId, eventId);
  const resolved = await access.discover();
  const { identity, sbAdmin, userId } = resolved;
  const repository = createPostgresColorOperationRepository(sbAdmin, userId);
  const executor = createColorOperationExecutor({
    repository,
    provider: createGoogleColorOperationProvider(access.provider),
    access,
  });
  async function inspect() {
    await access.assertAllowed(identity);
    return inspectPostgresColorOperation(sbAdmin, userId, identity);
  }
  return {
    identity,
    inspect,
    async readEvent() {
      await access.assertAllowed(identity);
      const { data, error } = await sbAdmin
        .from('workspace_calendar_events')
        .select('*')
        .eq('ws_id', identity.wsId)
        .eq('id', identity.eventId)
        .single();
      if (error || !data)
        throw new ColorOperationError('storage', 'Google event unavailable');
      return decryptEventFromStorage(data, identity.wsId);
    },
    execute: (operationId: string) => executor.execute(identity, operationId),
    cancel: (operationId: string) => executor.cancel(identity, operationId),
    async reserve(intent: GoogleProviderColorChoice) {
      if (intent.connectionId !== identity.connectionId)
        throw new ColorOperationError(
          'identity',
          'Google operation source changed'
        );
      const current = await inspect();
      // The RPC compares this generation in the event/ledger transaction.
      // A concurrent reservation can only cause conflict, never replacement.
      const requestHash = createHash('sha256')
        .update(
          JSON.stringify({ identity, kind: intent.kind, id: intent.id ?? null })
        )
        .digest('hex');
      const operation = await repository.reserve({
        id: randomUUID(),
        requestHash,
        intent,
        identity,
        expectedGeneration: current.generation,
      });
      return operation;
    },
  };
}
