import {
  inspectEmployeeAddressMigration,
  migrateEmployeeAddress,
} from '@tuturuuu/utils/internal-accounts/employee-address-migration';
import {
  type AddressMigrationPorts,
  AddressMigrationRequest,
  MigrationInspection,
  MigrationProviderObservation,
} from '@tuturuuu/utils/internal-accounts/employee-address-migration-contract';
import { createEmployeeAddressMigrationProvider } from '@tuturuuu/utils/internal-accounts/employee-address-migration-provider';
import { createEmployeeAddressMigrationJournal } from '@tuturuuu/utils/internal-accounts/employee-address-migration-rpc';
import { z } from 'zod';

const Body = z
  .strictObject(AddressMigrationRequest.shape)
  .omit({ actorId: true })
  .refine((value) => value.sourceAddress.endsWith('@xwf.tuturuuu.com'));
const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

/** Request-scoped adapter; the runtime gate defaults off independently of CREATE/RESTORE. */
export function createEmployeeAddressMigrationHandler(deps: {
  authorize(
    request: Request
  ): Promise<
    | { authorized: true; actorUserId: string }
    | { authorized: false; status: 401 | 403 | 503 }
  >;
  enabled(): boolean;
  trustedOrigin: string;
  configuration(): { url: string; key: string };
  admin(): Promise<
    Parameters<typeof createEmployeeAddressMigrationProvider>[0]['admin']
  >;
  newAttemptId(): string;
  fetch?: typeof fetch;
}) {
  return async (request: Request, action: 'migrate' | 'inspect') => {
    function result(body: object, status: number) {
      return Response.json(body, { status, headers });
    }
    if (!deps.enabled()) return result({ code: 'unavailable' }, 503);
    if (request.method !== 'POST')
      return result({ code: 'method_not_allowed' }, 405);
    const credential = request.headers.get('authorization');
    const site = request.headers.get('sec-fetch-site');
    if (
      request.headers.get('x-tuturuuu-account-action') !== '1' ||
      (site !== null && site !== 'same-origin')
    )
      return result({ code: 'forbidden' }, 403);
    if (
      (request.headers.get('origin') !== null &&
        request.headers.get('origin') !== deps.trustedOrigin) ||
      (credential === null &&
        request.headers.get('origin') !== deps.trustedOrigin) ||
      (credential !== null && !/^Bearer \S+$/i.test(credential))
    )
      return result({ code: 'forbidden' }, 403);
    if (
      request.headers
        .get('content-type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase() !== 'application/json'
    )
      return result({ code: 'invalid_input' }, 400);
    try {
      const actor = await deps.authorize(request);
      if (!actor.authorized) return result({ code: 'forbidden' }, actor.status);
      const actorUserId = actor.actorUserId;
      // Bounded body read before JSON/schema parsing.
      const reader = request.body?.getReader();
      if (!reader) return result({ code: 'invalid_input' }, 400);
      let text = '';
      let size = 0;
      const decoder = new TextDecoder('utf-8', { fatal: true });
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 4096) {
            await reader.cancel();
            return result({ code: 'invalid_input' }, 400);
          }
          text += decoder.decode(part.value, { stream: true });
        }
      } catch {
        return result({ code: 'invalid_input' }, 400);
      } finally {
        reader.releaseLock();
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(text + decoder.decode());
      } catch {
        return result({ code: 'invalid_input' }, 400);
      }
      const parsed = Body.safeParse(decoded);
      if (!parsed.success) return result({ code: 'invalid_input' }, 400);
      const validated = AddressMigrationRequest.safeParse({
        ...parsed.data,
        actorId: actorUserId,
      });
      if (!validated.success) return result({ code: 'invalid_input' }, 400);
      const tuple = validated.data;
      async function authorize(actorId: string) {
        if (!deps.enabled() || actorId !== actorUserId) return false;
        const current = await deps.authorize(request);
        return current.authorized && current.actorUserId === actorUserId;
      }
      const ports: AddressMigrationPorts = {
        journal: createEmployeeAddressMigrationJournal({
          ...deps.configuration(),
          request: tuple,
          authorize,
          fetch: deps.fetch,
        }),
        provider: createEmployeeAddressMigrationProvider({
          admin: await deps.admin(),
          binding: {
            userId: tuple.userId,
            sourceAddress: tuple.sourceAddress,
            destinationAddress: tuple.destinationAddress,
          },
          authorize: () => authorize(tuple.actorId),
        }),
        newAttemptId: deps.newAttemptId,
      };
      if (action === 'inspect') {
        const observed = MigrationInspection.parse(
          await ports.journal.inspect(tuple)
        );
        if (!observed.authorized)
          return result({ status: 'denied', code: 'forbidden' }, 403);
        if (!observed.record) {
          if (
            observed.revision !== tuple.expectedRevision ||
            !observed.sourceVerified ||
            !['available', 'same_identity'].includes(observed.addressOwnership)
          )
            return result({ status: 'denied', code: 'not_ready' }, 409);
          const source = MigrationProviderObservation.parse(
            await ports.provider.read(tuple.userId)
          );
          if (!(await authorize(tuple.actorId)))
            return result({ code: 'forbidden' }, 403);
          if (
            source.userId !== tuple.userId ||
            source.email !== tuple.sourceAddress ||
            !source.emailVerified ||
            !source.active ||
            source.providerIdentityFingerprint !==
              observed.providerIdentityFingerprint
          )
            return result({ status: 'denied', code: 'not_ready' }, 409);
          return result({ status: 'ready', ...parsed.data }, 200);
        }
      }
      const execute =
        action === 'migrate'
          ? migrateEmployeeAddress
          : inspectEmployeeAddressMigration;
      const outcome = await execute(ports, tuple);
      if (!(await authorize(tuple.actorId)))
        return result({ code: 'forbidden' }, 403);
      return result(
        outcome,
        outcome.status === 'completed'
          ? 200
          : outcome.status === 'pending'
            ? 202
            : 409
      );
    } catch {
      return result({ code: 'unavailable' }, 503);
    }
  };
}
