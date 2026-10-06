import 'server-only';

import { TextDecoder } from 'node:util';
import type { DesktopVaultMutation } from '@tuturuuu/internal-api/infrastructure';
import { Effect, Either } from '@tuturuuu/utils/effect';
import type { DesktopAdminDb } from './access';
import {
  inspectDesktopCertificate,
  inspectNotarizationKey,
} from './certificate-readiness';
import {
  assertDesktopSigningResources,
  DESKTOP_SIGNING_PROFILES,
} from './contract';
import { DesktopAdminStoreError, requireDesktopResult } from './store';
import { decryptDesktopDataKey, decryptDesktopResource } from './vault-crypto';

type DeliveryMutation = Extract<
  DesktopVaultMutation,
  { action: 'enable_delivery' | 'disable_delivery' }
>;
const notReady = () => {
  throw new DesktopAdminStoreError(409, 'desktop_material_not_ready');
};

/** No browser-supplied readiness receipt or raw credential can authorize admission. */
export async function inspectActiveDesktopMaterial(
  db: DesktopAdminDb,
  input: Extract<DeliveryMutation, { action: 'enable_delivery' }>
) {
  const privateDb = db.schema('private');
  const profile = DESKTOP_SIGNING_PROFILES[input.platform];
  const names: readonly string[] = [...profile.files, ...profile.scalars];
  const [version, resources] = await Promise.all([
    privateDb
      .from('desktop_deployment_versions')
      .select(
        'id,platform,status,revision,validated_revision,validation_errors,data_key_ciphertext'
      )
      .eq('id', input.versionId)
      .maybeSingle(),
    privateDb
      .from('desktop_deployment_resources')
      .select('name,encrypted_value,plaintext_sha256,plaintext_size')
      .eq('version_id', input.versionId)
      .limit(names.length + 1),
  ]);
  requireDesktopResult(version.error);
  requireDesktopResult(resources.error);
  if (
    !version.data ||
    version.data.platform !== input.platform ||
    version.data.status !== 'active' ||
    version.data.revision !== input.revision ||
    version.data.validated_revision !== input.revision ||
    version.data.validation_errors.length !== 0 ||
    !resources.data ||
    resources.data.length !== names.length ||
    new Set(resources.data.map((row) => row.name)).size !== names.length ||
    resources.data.some((row) => !names.includes(row.name))
  )
    notReady();
  let key: Buffer | undefined;
  const values = new Map<string, Buffer>();
  try {
    key = await decryptDesktopDataKey(version.data!.data_key_ciphertext);
    for (const row of resources.data!)
      values.set(
        row.name,
        decryptDesktopResource(
          row.encrypted_value,
          key,
          {
            versionId: input.versionId,
            platform: input.platform,
            name: row.name,
          },
          { sha256: row.plaintext_sha256, size: row.plaintext_size }
        )
      );
    const scalars = Object.fromEntries(
      profile.scalars.map((name) => [
        name,
        new TextDecoder('utf-8', { fatal: true }).decode(values.get(name)!),
      ])
    );
    assertDesktopSigningResources(input.platform, profile.files, scalars);
    const certificate = inspectDesktopCertificate({
      platform: input.platform,
      bytes: values.get(profile.files[0])!,
      password:
        scalars[
          input.platform === 'windows'
            ? 'WINDOWS_SIGNING_CERTIFICATE_PASSWORD'
            : 'MACOS_CERTIFICATE_PASSWORD'
        ]!,
      identity: scalars.MACOS_SIGNING_IDENTITY,
      teamId: scalars.APPLE_TEAM_ID,
    });
    if (
      !certificate.ok ||
      (input.platform === 'macos' &&
        !inspectNotarizationKey(
          values.get('macos_notarization_private_key_p8')!
        ).ok)
    )
      notReady();
    return {
      verifiedAt: new Date().toISOString(),
      validUntil: certificate.ok ? certificate.certificate.expiresAt : '',
    };
  } finally {
    key?.fill(0);
    for (const bytes of values.values()) bytes.fill(0);
  }
}

/** SQL repeats authorization and CAS, with an epoch that permanently invalidates old leases. */
export async function setDesktopDelivery(
  db: DesktopAdminDb,
  actor: string,
  input: DeliveryMutation
): Promise<void> {
  const result = await Effect.runPromise(
    Effect.either(
      Effect.tryPromise({
        try: async () => {
          const receipt =
            input.action === 'enable_delivery'
              ? await inspectActiveDesktopMaterial(db, input)
              : null;
          const applied = await db
            .schema('private')
            .rpc('desktop_deployment_set_delivery', {
              p_actor: actor,
              p_platform: input.platform,
              p_environment_revision: input.environmentRevision,
              p_enabled: input.action === 'enable_delivery',
              ...(input.action === 'enable_delivery' && receipt
                ? {
                    p_version: input.versionId,
                    p_version_revision: input.revision,
                    p_verified_at: receipt.verifiedAt,
                    p_material_valid_until: receipt.validUntil,
                  }
                : {}),
            });
          requireDesktopResult(applied.error);
        },
        catch: (error) =>
          error instanceof DesktopAdminStoreError
            ? error
            : new DesktopAdminStoreError(500, 'desktop_admission_unavailable'),
      })
    )
  );
  if (Either.isLeft(result)) throw result.left;
}
