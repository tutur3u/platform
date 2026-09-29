import 'server-only';

import type { SupabaseClient } from '@tuturuuu/supabase/types';
import type { Database } from '@tuturuuu/types';
import { MOBILE_DEPLOYMENT_ENVIRONMENT } from './constants';
import { decryptDataKey, decryptSecretValue } from './crypto';
import {
  getProductionEnvironment,
  getVersionById,
  listSecretsForVersion,
  MobileDeploymentStoreError,
  recordAudit,
} from './store';
import { renderEnvFile } from './validation';

type AdminClient = SupabaseClient<Database>;

/** Export only the Dart define file, never signing files or CI credentials. */
export async function exportActiveMobileDartDefines({
  db,
  userId,
}: {
  db: AdminClient;
  userId: string;
}) {
  const environment = await getProductionEnvironment(db);
  const version = await getVersionById(db, environment.active_version_id);
  if (!version) {
    throw new MobileDeploymentStoreError(
      'Mobile deployment has no active version',
      409,
      'no_active_version'
    );
  }

  const [secrets, dataKey] = await Promise.all([
    listSecretsForVersion(db, version.id),
    decryptDataKey(version.data_key_ciphertext),
  ]);
  const values: Record<string, string> = {};
  for (const secret of secrets) {
    if (secret.kind === 'env') {
      values[secret.name] = decryptSecretValue(secret.encrypted_value, dataKey);
    }
  }
  for (const name of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'API_BASE_URL',
  ]) {
    if (!values[name]) {
      throw new MobileDeploymentStoreError(
        `Active mobile configuration is missing ${name}`,
        409,
        'missing_dart_define'
      );
    }
  }

  await recordAudit(db, {
    actorType: 'user',
    actorUserId: userId,
    environmentId: environment.id,
    eventType: 'env.exported',
    metadata: { keyCount: Object.keys(values).length },
    resourceKind: '.env.github',
    versionId: version.id,
  });

  return {
    environment: MOBILE_DEPLOYMENT_ENVIRONMENT,
    envFile: renderEnvFile(values),
    versionNumber: version.version,
  };
}
