import 'server-only';

import {
  createEncryptedDataKey as createVaultDataKey,
  decryptDataKey as unwrapVaultDataKey,
} from '@tuturuuu/storage-core/vault/crypto';
import { workspaceKeyWrapper } from '@tuturuuu/storage-core/vault/workspace-key-wrapper';
import { getMasterKey } from '@tuturuuu/utils/encryption';

export {
  decryptBytes,
  decryptSecretValue,
  encryptBytes,
  encryptSecretValue,
  sha256Base64Url,
  sha256Hex,
  VaultEncryptionError as MobileDeploymentEncryptionError,
} from '@tuturuuu/storage-core/vault/crypto';

export async function createEncryptedDataKey() {
  return createVaultDataKey(workspaceKeyWrapper(getMasterKey()));
}

export async function decryptDataKey(encryptedDataKey: string) {
  return unwrapVaultDataKey(
    encryptedDataKey,
    workspaceKeyWrapper(getMasterKey())
  );
}

export function redactLastFour(value: string) {
  return value.length <= 4 ? value : value.slice(-4);
}
