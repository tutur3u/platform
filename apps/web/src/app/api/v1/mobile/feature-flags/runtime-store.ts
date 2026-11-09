import {
  asPrivateRpcAdmin,
  interpretRuntimeRead,
  type RuntimeEnvironment,
  type RuntimeStoreRead,
} from '@tuturuuu/feature-flags';
import { createAdminClient } from '@tuturuuu/supabase/next/server';

export async function loadMobileRuntimeFlags(
  environment: RuntimeEnvironment
): Promise<RuntimeStoreRead> {
  try {
    const admin = asPrivateRpcAdmin(
      await createAdminClient({ noCookie: true })
    );
    return interpretRuntimeRead(
      await admin.schema('private').rpc('platform_feature_flag_runtime_read', {
        p_environment: environment,
      })
    );
  } catch {
    return { status: 'unreachable' };
  }
}
