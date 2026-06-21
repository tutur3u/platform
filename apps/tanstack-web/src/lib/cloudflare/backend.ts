import {
  type BackendApiClientOptions,
  type BackendServiceBinding,
  withBackendServiceBinding,
} from '@tuturuuu/internal-api';

type CloudflareWorkersModule = {
  env?: {
    BACKEND?: BackendServiceBinding;
  };
};

async function getCloudflareBackendServiceBinding() {
  if (typeof window !== 'undefined') {
    return null;
  }

  try {
    const runtime = (await import(
      'cloudflare:workers'
    )) as CloudflareWorkersModule;

    return runtime.env?.BACKEND ?? null;
  } catch {
    return null;
  }
}

export async function withTanstackBackendRuntime(
  options: BackendApiClientOptions = {}
) {
  return withBackendServiceBinding(
    await getCloudflareBackendServiceBinding(),
    options
  );
}
