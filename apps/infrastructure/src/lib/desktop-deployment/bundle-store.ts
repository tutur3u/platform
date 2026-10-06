import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { Effect, Either } from '@tuturuuu/utils/effect';
import type { DesktopAdminDb } from './access';
import {
  inspectDesktopCertificate,
  inspectNotarizationKey,
} from './certificate-readiness';
import {
  assertDesktopSigningResources,
  DESKTOP_SIGNING_PROFILES,
  type DesktopDeploymentPlatform,
} from './contract';
import type { DesktopDeploymentClaims } from './oidc-claims';
import { decryptDesktopDataKey, decryptDesktopResource } from './vault-crypto';

export class DesktopBundleError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string
  ) {
    super('Desktop signing bundle unavailable');
  }
}

export type DesktopSigningBundle = {
  schemaVersion: 1;
  platform: DesktopDeploymentPlatform;
  versionId: string;
  files: { name: string; base64: string; sha256: string; size: number }[];
  scalars: Record<string, string>;
};

function failure(error: unknown): DesktopBundleError {
  return error instanceof DesktopBundleError
    ? error
    : new DesktopBundleError(500, 'desktop_bundle_unavailable');
}
function requireResult(error: { code?: string } | null) {
  if (!error) return;
  throw new DesktopBundleError(
    error.code === '42501'
      ? 403
      : error.code === '23505' || error.code === '40001'
        ? 409
        : 500,
    'desktop_bundle_rejected'
  );
}

/** Only verified desktop OIDC claims may reach this service; no retry of consumed leases. */
export async function fetchDesktopSigningBundle(input: {
  db: DesktopAdminDb;
  token: string;
  platform: DesktopDeploymentPlatform;
  claims: DesktopDeploymentClaims;
}): Promise<DesktopSigningBundle> {
  const result = await Effect.runPromise(
    Effect.either(
      Effect.tryPromise({ try: () => fetchOnce(input), catch: failure })
    )
  );
  if (Either.isLeft(result)) throw result.left;
  return result.right;
}

async function fetchOnce({
  db,
  token,
  platform,
  claims,
}: {
  db: DesktopAdminDb;
  token: string;
  platform: DesktopDeploymentPlatform;
  claims: DesktopDeploymentClaims;
}): Promise<DesktopSigningBundle> {
  if (!/^ttr_desktop_ci_[A-Za-z0-9_-]{43}$/u.test(token))
    throw new DesktopBundleError(401, 'desktop_bundle_unauthorized');
  const privateDb = db.schema('private');
  const found = await privateDb
    .from('desktop_deployment_ci_tokens')
    .select('id,platform,version_id,token_hash')
    .eq('token_prefix', token.slice(0, 32))
    .maybeSingle();
  requireResult(found.error);
  const row = found.data;
  const digest = createHash('sha256').update(token).digest();
  if (
    !row ||
    row.platform !== platform ||
    !/^[a-f0-9]{64}$/u.test(row.token_hash) ||
    !timingSafeEqual(digest, Buffer.from(row.token_hash, 'hex'))
  )
    throw new DesktopBundleError(401, 'desktop_bundle_unauthorized');
  const reservation = await privateDb.rpc('desktop_deployment_reserve_bundle', {
    p_token: row.id,
    p_platform: platform,
    p_run_id: claims.runId,
    p_attempt: claims.runAttempt,
    p_sha: claims.sha,
  });
  requireResult(reservation.error);
  const lease = reservation.data;
  if (
    !lease ||
    lease.version_id !== row.version_id ||
    lease.platform !== platform
  )
    throw new DesktopBundleError(500, 'desktop_bundle_unavailable');
  let completed = false;
  let key: Buffer | undefined;
  const values = new Map<string, Buffer>();
  try {
    const profile = DESKTOP_SIGNING_PROFILES[platform];
    const names: readonly string[] = [...profile.files, ...profile.scalars];
    const [version, resources] = await Promise.all([
      privateDb
        .from('desktop_deployment_versions')
        .select('id,platform,status,data_key_ciphertext')
        .eq('id', lease.version_id)
        .maybeSingle(),
      privateDb
        .from('desktop_deployment_resources')
        .select('name,encrypted_value,plaintext_sha256,plaintext_size')
        .eq('version_id', lease.version_id)
        .limit(names.length + 1),
    ]);
    requireResult(version.error);
    requireResult(resources.error);
    if (
      version.data?.status !== 'active' ||
      version.data.platform !== platform ||
      !resources.data ||
      resources.data.length !== names.length ||
      new Set(resources.data.map((item) => item.name)).size !== names.length ||
      resources.data.some((item) => !names.includes(item.name))
    )
      throw new DesktopBundleError(409, 'desktop_bundle_material_invalid');
    key = await decryptDesktopDataKey(version.data.data_key_ciphertext);
    for (const resource of resources.data) {
      values.set(
        resource.name,
        decryptDesktopResource(
          resource.encrypted_value,
          key,
          {
            versionId: lease.version_id,
            platform,
            name: resource.name,
          },
          { sha256: resource.plaintext_sha256, size: resource.plaintext_size }
        )
      );
    }
    const scalars = Object.fromEntries(
      profile.scalars.map((name) => [
        name,
        new TextDecoder('utf-8', { fatal: true }).decode(values.get(name)!),
      ])
    );
    assertDesktopSigningResources(platform, profile.files, scalars);
    const certificate = inspectDesktopCertificate({
      platform,
      bytes: values.get(profile.files[0])!,
      password:
        scalars[
          platform === 'windows'
            ? 'WINDOWS_SIGNING_CERTIFICATE_PASSWORD'
            : 'MACOS_CERTIFICATE_PASSWORD'
        ]!,
      identity: scalars.MACOS_SIGNING_IDENTITY,
      teamId: scalars.APPLE_TEAM_ID,
    });
    if (
      !certificate.ok ||
      (platform === 'macos' &&
        !inspectNotarizationKey(
          values.get('macos_notarization_private_key_p8')!
        ).ok)
    )
      throw new DesktopBundleError(409, 'desktop_bundle_material_invalid');
    const result: DesktopSigningBundle = {
      schemaVersion: 1,
      platform,
      versionId: lease.version_id,
      scalars,
      files: profile.files.map((name) => {
        const bytes = values.get(name)!;
        return {
          name,
          base64: bytes.toString('base64'),
          sha256: createHash('sha256').update(bytes).digest('hex'),
          size: bytes.length,
        };
      }),
    };
    // Recheck revocation, expiry and current environment/version after decryption.
    const complete = await privateDb.rpc('desktop_deployment_complete_bundle', {
      p_lease: lease.id,
    });
    requireResult(complete.error);
    completed = true;
    return result;
  } catch (error) {
    if (!completed) {
      // Best effort marks the reservation consumed; uniqueness also denies reuse
      // when the database is unavailable during failure recording.
      try {
        await privateDb.rpc('desktop_deployment_complete_bundle', {
          p_lease: lease.id,
          p_failure_code: 'material_or_admission_failed',
        });
      } catch {
        /* never expose private diagnostics */
      }
    }
    throw failure(error);
  } finally {
    key?.fill(0);
    for (const bytes of values.values()) bytes.fill(0);
  }
}
