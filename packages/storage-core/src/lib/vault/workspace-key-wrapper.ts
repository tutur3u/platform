import {
  decryptWorkspaceKey,
  encryptWorkspaceKey,
} from '@tuturuuu/utils/encryption';
import type { VaultKeyWrapper } from './crypto';

export function workspaceKeyWrapper(masterKey: string): VaultKeyWrapper {
  if (!masterKey.trim()) throw new Error('Vault master key is not configured');
  return {
    wrap: (dataKey) => encryptWorkspaceKey(dataKey, masterKey),
    unwrap: (encryptedDataKey) =>
      decryptWorkspaceKey(encryptedDataKey, masterKey),
  };
}
