import 'server-only';

import { randomBytes } from 'node:crypto';
import { createClient } from '@tuturuuu/supabase/next/server';
import { z } from 'zod';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  DeviceMfaError,
  deviceProofHash,
  hasDeviceProof,
  loadDeviceRegistry,
  mutateDeviceRegistry,
  publicRegistry,
} from './registry';

export const deviceRequestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('enroll'),
    name: z.string().trim().min(1).max(60),
  }),
  z.object({
    action: z.literal('cancel'),
    factorId: z.string().uuid(),
    proof: z.string().min(32).max(256),
  }),
  z.object({
    action: z.literal('confirm'),
    factorId: z.string().uuid(),
    proof: z.string().min(32).max(256),
  }),
  z.object({
    action: z.literal('policy'),
    factorId: z.string().uuid(),
    proof: z.string().min(32).max(256),
    locked: z.boolean(),
  }),
  z.object({
    action: z.literal('remove'),
    factorId: z.string().uuid(),
    proof: z.string().min(32).max(256),
    targetFactorId: z.string().uuid(),
  }),
]);

export async function deviceMfaRequest(
  request: Request,
  input?: z.infer<typeof deviceRequestSchema>
) {
  const client = await createClient(request);
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) throw new DeviceMfaError(401, 'Authentication required');
  const limit = await checkRateLimit(
    `auth:device-mfa:${input?.action ?? 'list'}:${user.id}`,
    { maxRequests: input ? 10 : 60, windowMs: 60_000 }
  );
  if (!('allowed' in limit))
    throw new DeviceMfaError(429, 'Please wait before trying again');
  if (!input) return publicRegistry(await loadDeviceRegistry(user.id));
  // Bearer clients are stateless: no stored session exists for the SDK to
  // inspect. Pass the token explicitly so it validates the user and reads AAL.
  const authorization = request.headers.get('authorization');
  const accessToken = authorization?.startsWith('Bearer ')
    ? authorization.slice(7).trim()
    : undefined;
  const { data: assurance, error: assuranceError } =
    await client.auth.mfa.getAuthenticatorAssuranceLevel(accessToken);
  if (
    assuranceError ||
    !assurance ||
    !assurance.currentLevel ||
    (assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2')
  ) {
    throw new DeviceMfaError(403, 'Verify your existing authenticator first');
  }
  let createdFactorId: string | undefined;
  try {
    return await mutateDeviceRegistry(user.id, async (registry) => {
      if (input.action === 'enroll') {
        if (registry.locked)
          throw new DeviceMfaError(
            423,
            'New authenticator registrations are locked. Unlock them on a trusted device.'
          );
        if (registry.devices.length >= 10)
          throw new DeviceMfaError(
            409,
            'Remove an unused authenticator before adding another'
          );
        const enrolled = await client.auth.mfa.enroll({
          factorType: 'totp',
          friendlyName: `${input.name} ${randomBytes(3).toString('hex')}`,
          issuer: 'Tuturuuu',
        });
        if (enrolled.error || !enrolled.data)
          throw new DeviceMfaError(
            400,
            'Could not start authenticator registration'
          );
        createdFactorId = enrolled.data.id;
        const proof = randomBytes(32).toString('base64url');
        registry.devices.push({
          factorId: enrolled.data.id,
          proofHash: deviceProofHash(proof),
          name: input.name,
          createdAt: new Date().toISOString(),
          verified: false,
        });
        return {
          factorId: enrolled.data.id,
          secret: enrolled.data.totp.secret,
          proof,
        };
      }
      if (
        !hasDeviceProof(
          registry,
          input.factorId,
          input.proof,
          input.action === 'confirm' || input.action === 'cancel'
        )
      ) {
        throw new DeviceMfaError(
          403,
          'Use a trusted authenticator to make this change'
        );
      }
      if (input.action === 'cancel') {
        const device = registry.devices.find(
          (item) => item.factorId === input.factorId
        )!;
        if (device.verified)
          throw new DeviceMfaError(
            403,
            'Cannot cancel an active authenticator'
          );
        const { data: factors, error: factorError } =
          await client.auth.mfa.listFactors();
        if (
          factorError ||
          factors.totp.some(
            (factor) =>
              factor.id === input.factorId && factor.status === 'verified'
          )
        )
          throw new DeviceMfaError(
            403,
            'Cannot cancel a verified authenticator'
          );
        const { error: removeError } = await client.auth.mfa.unenroll({
          factorId: input.factorId,
        });
        if (removeError)
          throw new DeviceMfaError(400, 'Could not cancel registration');
        registry.devices = registry.devices.filter(
          (item) => item.factorId !== input.factorId
        );
        return publicRegistry(registry);
      }
      if (assurance.currentLevel !== 'aal2')
        throw new DeviceMfaError(403, 'MFA verification required');
      const { data: activeFactors, error: activeError } =
        await client.auth.mfa.listFactors();
      if (
        activeError ||
        !activeFactors.totp.some(
          (factor) =>
            factor.id === input.factorId && factor.status === 'verified'
        )
      )
        throw new DeviceMfaError(403, 'Use an active trusted authenticator');
      if (input.action === 'confirm') {
        const pending = registry.devices.find(
          (item) => item.factorId === input.factorId
        )!;
        if (registry.locked && !pending.verified)
          throw new DeviceMfaError(
            423,
            'New authenticator registrations are locked'
          );
        const { data: factors, error: factorError } =
          await client.auth.mfa.listFactors();
        if (
          factorError ||
          !factors.totp.some(
            (factor) =>
              factor.id === input.factorId && factor.status === 'verified'
          )
        ) {
          throw new DeviceMfaError(
            403,
            'Finish verifying this authenticator first'
          );
        }
        const device = registry.devices.find(
          (item) => item.factorId === input.factorId
        )!;
        device.verified = true;
      } else if (input.action === 'policy') {
        if (
          input.locked &&
          registry.devices.filter(
            (device) =>
              device.verified &&
              activeFactors.totp.some(
                (factor) =>
                  factor.id === device.factorId && factor.status === 'verified'
              )
          ).length < 2
        )
          throw new DeviceMfaError(
            409,
            'Register a second trusted device before locking registrations'
          );
        registry.locked = input.locked;
      } else {
        if (
          !registry.devices.some(
            (item) => item.factorId === input.targetFactorId
          )
        )
          throw new DeviceMfaError(404, 'Authenticator not found');
        if (
          registry.locked &&
          registry.devices.filter(
            (item) =>
              item.verified &&
              activeFactors.totp.some(
                (factor) =>
                  factor.id === item.factorId && factor.status === 'verified'
              )
          ).length === 1 &&
          input.targetFactorId === input.factorId
        ) {
          throw new DeviceMfaError(
            409,
            'Unlock registrations before removing your last trusted device'
          );
        }
        if (
          activeFactors.all.some((factor) => factor.id === input.targetFactorId)
        ) {
          const { error: removeError } = await client.auth.mfa.unenroll({
            factorId: input.targetFactorId,
          });
          if (removeError)
            throw new DeviceMfaError(400, 'Could not remove authenticator');
        }
        registry.devices = registry.devices.filter(
          (item) => item.factorId !== input.targetFactorId
        );
      }
      return publicRegistry(registry);
    });
  } catch (error) {
    if (createdFactorId) {
      // Never activate a factor whose secret could not be returned durably.
      await client.auth.mfa
        .unenroll({ factorId: createdFactorId })
        .catch(() => undefined);
    }
    throw error;
  }
}
