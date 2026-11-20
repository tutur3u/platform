import type { NativeIntegrityStore } from '@tuturuuu/internal-api/native-integrity';
import type { AbuseGuardClient } from '@tuturuuu/utils/abuse-guard/client';
import { integrityProviderReservationSchema } from '@tuturuuu/utils/abuse-guard/protocol';
import { z } from 'zod';
import type { NativeIntegrityProviderReserve } from './provider-budget';
import { challengeSchema, keySchema } from './store';

const prefix = 'native-integrity:v1';
const nonce = (id: string) => `${prefix}:nonce:${id}`;
const keyName = (actorId: string, keyId: string) =>
  `${prefix}:key:${JSON.stringify([actorId, keyId])}`;
const index = (actorId: string) => `${prefix}:actor-keys:${actorId}`;
const play = (actorId: string) => `${prefix}:play-capability:${actorId}`;
const actor = (actorId: string) => `${prefix}:actor:${actorId}`;

export function createNativeIntegrityGuardStore(
  client: Pick<AbuseGuardClient, 'nativeIntegrity'>,
  now = Date.now
) {
  const run = client.nativeIntegrity.bind(client);
  const boolean = z.boolean();
  const readRecord = z.string().nullable();
  const store: NativeIntegrityStore = {
    async issueChallenge(record, quota) {
      const ttlMs = Math.min(120_000, record.expiresAt - now());
      if (ttlMs <= 0) return false;
      return boolean.parse(
        await run(
          [
            `${prefix}:issue:${record.actorId}`,
            `${prefix}:hour:${record.actorId}`,
            nonce(record.id),
          ],
          {
            action: 'issue',
            value: JSON.stringify(challengeSchema.parse(record)),
            ...quota,
            ttlMs,
          }
        )
      );
    },
    async consumeChallenge(id) {
      const result = readRecord.parse(
        await run([nonce(id)], { action: 'consume' })
      );
      return result === null ? null : challengeSchema.parse(JSON.parse(result));
    },
    async getKey(actorId, keyId) {
      const result = readRecord.parse(
        await run([keyName(actorId, keyId)], { action: 'read-key' })
      );
      if (result === null) return null;
      const record = keySchema.parse(JSON.parse(result));
      return record.actorId === actorId ? record : null;
    },
    async registerKey(actorId, keyId, record) {
      if (record.actorId !== actorId || record.counter !== 0) return false;
      return boolean.parse(
        await run(
          [
            keyName(actorId, keyId),
            index(actorId),
            `${prefix}:owner:${keyId}`,
            actor(actorId),
          ],
          { action: 'register', value: JSON.stringify(keySchema.parse(record)) }
        )
      );
    },
    async advanceCounter(actorId, keyId, expected, next) {
      if (!Number.isSafeInteger(next) || next <= expected) return false;
      return boolean.parse(
        await run([keyName(actorId, keyId)], {
          action: 'advance',
          expected,
          next,
        })
      );
    },
    async hasNativeCapability(actorId) {
      return boolean.parse(
        await run([index(actorId), play(actorId)], { action: 'capability' })
      );
    },
    async recordVerifiedPlayCapability(actorId) {
      if (!boolean.parse(await run([play(actorId)], { action: 'mark-play' })))
        throw new Error('Native capability persistence unavailable');
    },
  };
  const reserve: NativeIntegrityProviderReserve = async (
    [, day, actorDay, warning],
    [limit, ttlSeconds, actorLimit, warningAt]
  ) => {
    const result = integrityProviderReservationSchema.parse(
      await run([day, actorDay, warning], {
        action: 'reserve-provider',
        limit,
        ttlSeconds,
        actorLimit,
        warningAt,
      })
    );
    return [
      Number(result.reserved),
      result.used,
      result.actor,
      Number(result.warning),
    ];
  };
  const revoke = async (actorId: string) =>
    z
      .number()
      .int()
      .min(0)
      .max(9)
      .parse(
        await run([index(actorId), play(actorId), actor(actorId)], {
          action: 'revoke',
        })
      );
  return { store, reserve, revoke };
}
