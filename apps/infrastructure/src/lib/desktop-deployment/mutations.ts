import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { TextDecoder } from 'node:util';
import type { DesktopVaultMutation } from '@tuturuuu/internal-api/infrastructure';
import type { DesktopAdminDb } from './access';
import { setDesktopDelivery } from './admission';
import {
  inspectDesktopCertificate,
  inspectNotarizationKey,
} from './certificate-readiness';
import {
  assertDesktopPlatform,
  assertDesktopSigningResources,
  DESKTOP_SIGNING_PROFILES,
} from './contract';
import { DesktopAdminStoreError, requireDesktopResult } from './store';
import {
  createDesktopDataKey,
  decryptDesktopDataKey,
  decryptDesktopResource,
  encryptDesktopResource,
} from './vault-crypto';

async function draft(db: DesktopAdminDb, versionId: string, revision: number) {
  const result = await db
    .schema('private')
    .from('desktop_deployment_versions')
    .select('id,platform,status,revision,data_key_ciphertext')
    .eq('id', versionId)
    .maybeSingle();
  requireDesktopResult(result.error);
  if (!result.data)
    throw new DesktopAdminStoreError(404, 'desktop_version_not_found');
  if (result.data.status !== 'draft' || result.data.revision !== revision)
    throw new DesktopAdminStoreError(409, 'desktop_revision_conflict');
  return {
    ...result.data,
    platform: assertDesktopPlatform(result.data.platform),
  };
}

export async function saveDesktopResource(
  db: DesktopAdminDb,
  actor: string,
  input: {
    versionId: string;
    revision: number;
    name: string;
    bytes: Buffer;
    kind: 'file' | 'scalar';
  }
) {
  const version = await draft(db, input.versionId, input.revision);
  const names: readonly string[] =
    input.kind === 'file'
      ? DESKTOP_SIGNING_PROFILES[version.platform].files
      : DESKTOP_SIGNING_PROFILES[version.platform].scalars;
  if (
    !names.includes(input.name) ||
    input.bytes.length === 0 ||
    input.bytes.length > (input.kind === 'file' ? 2097152 : 32768)
  )
    throw new DesktopAdminStoreError(400, 'desktop_resource_invalid');
  if (input.kind === 'scalar') {
    let value: string;
    try {
      value = new TextDecoder('utf-8', { fatal: true }).decode(input.bytes);
    } catch {
      throw new DesktopAdminStoreError(400, 'desktop_resource_invalid');
    }
    if (
      Array.from(value).some(
        (char) => char.codePointAt(0)! < 32 || char.codePointAt(0) === 127
      )
    )
      throw new DesktopAdminStoreError(400, 'desktop_resource_invalid');
  }
  const key = await decryptDesktopDataKey(version.data_key_ciphertext);
  try {
    const encrypted = encryptDesktopResource(input.bytes, key, {
      versionId: version.id,
      platform: version.platform,
      name: input.name,
    });
    const result = await db
      .schema('private')
      .rpc('desktop_deployment_write_resource', {
        p_actor: actor,
        p_version: version.id,
        p_revision: input.revision,
        p_name: input.name,
        p_ciphertext: encrypted.ciphertext,
        p_sha256: encrypted.sha256,
        p_size: encrypted.size,
      });
    requireDesktopResult(result.error);
  } finally {
    key.fill(0);
  }
}

export async function validateDesktopDraft(
  db: DesktopAdminDb,
  actor: string,
  versionId: string,
  revision: number
) {
  const version = await draft(db, versionId, revision);
  const result = await db
    .schema('private')
    .from('desktop_deployment_resources')
    .select('name,encrypted_value,plaintext_sha256,plaintext_size')
    .eq('version_id', versionId);
  requireDesktopResult(result.error);
  const key = await decryptDesktopDataKey(version.data_key_ciphertext);
  const values = new Map<string, Buffer>();
  const errors: string[] = [];
  try {
    for (const row of result.data ?? [])
      values.set(
        row.name,
        decryptDesktopResource(
          row.encrypted_value,
          key,
          { versionId, platform: version.platform, name: row.name },
          { sha256: row.plaintext_sha256, size: row.plaintext_size }
        )
      );
    const profile = DESKTOP_SIGNING_PROFILES[version.platform];
    const files = profile.files.filter((name) => values.has(name));
    const scalars = Object.fromEntries(
      profile.scalars
        .filter((name) => values.has(name))
        .map((name) => [
          name,
          new TextDecoder('utf-8', { fatal: true }).decode(values.get(name)!),
        ])
    );
    try {
      assertDesktopSigningResources(version.platform, files, scalars);
    } catch {
      errors.push('signing_profile_invalid');
    }
    if (!errors.length) {
      const certificate = inspectDesktopCertificate({
        platform: version.platform,
        bytes: values.get(profile.files[0])!,
        password:
          scalars[
            version.platform === 'windows'
              ? 'WINDOWS_SIGNING_CERTIFICATE_PASSWORD'
              : 'MACOS_CERTIFICATE_PASSWORD'
          ]!,
        identity: scalars.MACOS_SIGNING_IDENTITY,
        teamId: scalars.APPLE_TEAM_ID,
      });
      if (!certificate.ok) errors.push(certificate.code);
      if (version.platform === 'macos') {
        const notarization = inspectNotarizationKey(
          values.get('macos_notarization_private_key_p8')!
        );
        if (!notarization.ok) errors.push(notarization.code);
      }
    }
    const validation = await db
      .schema('private')
      .rpc('desktop_deployment_validate_version', {
        p_actor: actor,
        p_version: versionId,
        p_revision: revision,
        p_errors: errors,
      });
    requireDesktopResult(validation.error);
    return errors;
  } finally {
    key.fill(0);
    for (const bytes of values.values()) bytes.fill(0);
  }
}

export async function applyDesktopMutation(
  db: DesktopAdminDb,
  actor: string,
  input: DesktopVaultMutation
): Promise<string | undefined> {
  const privateDb = db.schema('private');
  switch (input.action) {
    case 'enable_delivery':
    case 'disable_delivery':
      await setDesktopDelivery(db, actor, input);
      return;
    case 'create_version': {
      const dataKey = await createDesktopDataKey();
      try {
        const result = await privateDb.rpc(
          'desktop_deployment_create_version',
          {
            p_actor: actor,
            p_platform: input.platform,
            p_data_key_ciphertext: dataKey.ciphertext,
          }
        );
        requireDesktopResult(result.error);
      } finally {
        dataKey.key.fill(0);
      }
      return;
    }
    case 'save_scalar': {
      const bytes = Buffer.from(input.value, 'utf8');
      try {
        await saveDesktopResource(db, actor, {
          ...input,
          bytes,
          kind: 'scalar',
        });
      } finally {
        bytes.fill(0);
      }
      return;
    }
    case 'remove_resource': {
      const version = await draft(db, input.versionId, input.revision);
      const profile = DESKTOP_SIGNING_PROFILES[version.platform];
      if (
        ![...profile.files, ...profile.scalars].some(
          (name) => name === input.name
        )
      )
        throw new DesktopAdminStoreError(400, 'desktop_resource_invalid');
      const result = await privateDb.rpc('desktop_deployment_remove_resource', {
        p_actor: actor,
        p_version: input.versionId,
        p_revision: input.revision,
        p_name: input.name,
      });
      requireDesktopResult(result.error);
      return;
    }
    case 'validate':
      await validateDesktopDraft(db, actor, input.versionId, input.revision);
      return;
    case 'activate': {
      // Reinspect time-sensitive certificate validity at activation, not just at
      // an earlier validation action. CAS still rejects concurrent draft edits.
      const errors = await validateDesktopDraft(
        db,
        actor,
        input.versionId,
        input.revision
      );
      if (errors.length)
        throw new DesktopAdminStoreError(409, 'desktop_version_not_ready');
      const result = await privateDb.rpc(
        'desktop_deployment_activate_version',
        {
          p_actor: actor,
          p_version: input.versionId,
          p_revision: input.revision,
        }
      );
      requireDesktopResult(result.error);
      return;
    }
    case 'create_token': {
      const token = `ttr_desktop_ci_${randomBytes(32).toString('base64url')}`;
      const result = await privateDb.rpc('desktop_deployment_create_token', {
        p_actor: actor,
        p_version: input.versionId,
        p_expires: input.expiresAt,
        p_name: 'desktop-beta',
        p_prefix: token.slice(0, 32),
        p_hash: createHash('sha256').update(token).digest('hex'),
      });
      requireDesktopResult(result.error);
      return token;
    }
    case 'revoke_token': {
      const result = await privateDb.rpc('desktop_deployment_revoke_token', {
        p_actor: actor,
        p_token: input.tokenId,
      });
      requireDesktopResult(result.error);
    }
  }
}
