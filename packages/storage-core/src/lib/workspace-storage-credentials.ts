import 'server-only';

import type { WorkspaceSecret } from '@tuturuuu/types/primitives/WorkspaceSecret';
import { resolveWorkspaceId } from '@tuturuuu/utils/constants';
import { revealWorkspaceCredential } from '@tuturuuu/utils/workspace-secrets/runtime';
import {
  DRIVE_R2_ACCESS_KEY_ID_SECRET,
  DRIVE_R2_SECRET_ACCESS_KEY_SECRET,
} from './workspace-storage-config';

export const DRIVE_R2_CREDENTIAL_SECRET_NAMES = [
  DRIVE_R2_ACCESS_KEY_ID_SECRET,
  DRIVE_R2_SECRET_ACCESS_KEY_SECRET,
] as const;

/**
 * Maps secret names to their plaintext row values, keeping the first row per
 * name (rows arrive newest first).
 */
export function createWorkspaceStorageSecretsMap(
  secrets: readonly WorkspaceSecret[] | null | undefined
): Map<string, string> {
  const map = new Map<string, string>();

  for (const secret of secrets ?? []) {
    if (
      !secret.name ||
      typeof secret.value !== 'string' ||
      map.has(secret.name)
    ) {
      continue;
    }

    map.set(secret.name, secret.value);
  }

  return map;
}

/**
 * Returns a copy of `secretMap` whose credential-tier entries come from the
 * workspace secrets Worker when a binding is installed, or from the
 * plaintext rows already in `secretMap` otherwise. Config-tier entries are
 * kept as they are. A Worker failure rejects with
 * WorkspaceSecretsUnavailableError instead of using a plaintext value.
 */
export async function revealWorkspaceStorageCredentials(
  wsId: string,
  secretMap: ReadonlyMap<string, string>,
  names: readonly string[]
): Promise<Map<string, string>> {
  const revealed = new Map(secretMap);
  const values = await Promise.all(
    names.map((name) =>
      revealWorkspaceCredential({
        wsId: resolveWorkspaceId(wsId),
        name,
        purpose: 'storage',
        legacyRead: async () => secretMap.get(name) ?? null,
      })
    )
  );

  names.forEach((name, index) => {
    const value = values[index];
    if (typeof value === 'string') revealed.set(name, value);
    else revealed.delete(name);
  });

  return revealed;
}
