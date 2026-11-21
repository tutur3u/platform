import 'server-only';

import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { downloadWorkspaceStorageObjectForProvider } from '@/lib/workspace-storage-provider';
import {
  EXPECTED_IOS_BUNDLE_ID,
  type MobileDeploymentScalarName,
} from '../mobile-deployment/constants';
import {
  decryptBytes,
  decryptDataKey,
  decryptSecretValue,
  sha256Hex,
} from '../mobile-deployment/crypto';
import {
  getProductionEnvironment,
  getVersionById,
  listFilesForVersion,
  listSecretsForVersion,
  MobileDeploymentStoreError,
} from '../mobile-deployment/store';

type AdminClient = SupabaseClient<Database>;

/** Read only the active Apple API key; do not expose the signing bundle. */
export async function readActiveAppleReviewCredentials(db: AdminClient) {
  const environment = await getProductionEnvironment(db);
  const version = await getVersionById(db, environment.active_version_id);
  if (!version)
    throw new MobileDeploymentStoreError('No active mobile version', 409);
  const [secrets, files] = await Promise.all([
    listSecretsForVersion(db, version.id),
    listFilesForVersion(db, version.id),
  ]);
  const key = await decryptDataKey(version.data_key_ciphertext);
  const scalar = (name: MobileDeploymentScalarName) => {
    const row = secrets.find(
      (secret) => secret.kind === 'scalar' && secret.name === name
    );
    return row ? decryptSecretValue(row.encrypted_value, key) : null;
  };
  const keyId = scalar('APP_STORE_CONNECT_API_KEY_ID');
  const issuerId = scalar('APP_STORE_CONNECT_ISSUER_ID');
  const bundleId = scalar('APPLE_BUNDLE_ID');
  const file = files.find(
    (item) => item.kind === 'app_store_connect_private_key_p8'
  );
  if (!keyId || !issuerId || bundleId !== EXPECTED_IOS_BUNDLE_ID || !file)
    throw new MobileDeploymentStoreError(
      'Apple review vault is incomplete',
      409
    );
  const encrypted = await downloadWorkspaceStorageObjectForProvider(
    ROOT_WORKSPACE_ID,
    file.storage_provider,
    file.storage_path,
    { allowReservedMobileDeploymentVault: true }
  );
  if (sha256Hex(encrypted.buffer) !== file.ciphertext_sha256)
    throw new MobileDeploymentStoreError(
      'Apple key integrity check failed',
      409
    );
  const plaintext = decryptBytes(encrypted.buffer, key);
  if (sha256Hex(plaintext) !== file.plaintext_sha256)
    throw new MobileDeploymentStoreError(
      'Apple key integrity check failed',
      409
    );
  return {
    keyId,
    issuerId,
    privateKey: Buffer.from(plaintext).toString('utf8'),
    environmentId: environment.id,
    versionId: version.id,
  };
}
