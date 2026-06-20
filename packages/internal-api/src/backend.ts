import {
  createInternalApiClient,
  type InternalApiClientOptions,
  type InternalApiFetchInit,
} from './client';

export type BackendMigrationStatus = {
  backend: {
    deploymentTarget: string;
    runtime: string;
    service: string;
    toolchain: string;
  };
  environment: string;
  frontendTargets: ('next' | 'tanstack-start')[];
  ok: boolean;
  routeOwnership: {
    legacyAllowed: boolean;
    manifest: string;
    status: string;
  };
};

export type BackendLegacyHealth = {
  status: 'ok';
};

export type BackendRouteManifestSummary = {
  apiRoutes: number;
  cronRoutes: number;
  layouts: number;
  methodCounts: Record<
    'DELETE' | 'GET' | 'HEAD' | 'OPTIONS' | 'PATCH' | 'POST' | 'PUT',
    number
  >;
  pages: number;
  routeHandlers: number;
  total: number;
};

export type BackendRouteManifestRoute = {
  id: string;
  kind: string;
  method?: string;
  methods: string[];
  parentId?: string;
  routePath: string;
  sourceFile: string;
  status: 'accepted-removal' | 'legacy-next' | 'migrated';
  targetOwner: 'rust-backend' | 'tanstack-start';
};

export type BackendRouteManifestProgressBucket = {
  acceptedRemoval: number;
  key: string;
  label: string;
  legacyNext: number;
  migrated: number;
  percentComplete: number;
  remaining: number;
  terminal: number;
  total: number;
  unknownStatus: number;
};

export type BackendRouteManifestProgress = {
  byKind: BackendRouteManifestProgressBucket[];
  byOwner: BackendRouteManifestProgressBucket[];
  topLegacyRoutes: Pick<
    BackendRouteManifestRoute,
    | 'id'
    | 'kind'
    | 'method'
    | 'methods'
    | 'parentId'
    | 'routePath'
    | 'sourceFile'
    | 'status'
    | 'targetOwner'
  >[];
  totals: BackendRouteManifestProgressBucket;
};

export type BackendMigrationManifest = {
  generatedBy: string;
  progress: BackendRouteManifestProgress;
  routes: BackendRouteManifestRoute[];
  summary: BackendRouteManifestSummary;
};

export type BackendMigrationProgress = {
  generatedBy: string;
  manifest: string;
  ok: boolean;
  progress: BackendRouteManifestProgress;
  summary: BackendRouteManifestSummary;
};

export type BackendMigrationCutoverGates = {
  counts: {
    acceptedRemoval: number;
    backendOwned: number;
    backendRouteArtifacts: number;
    frontendOwned: number;
    legacyNext: number;
    migrated: number;
    total: number;
    unknownStatus: number;
    unmapped: number;
  };
  gates: {
    detail: string;
    id: string;
    label: string;
    ok: boolean;
    status: 'blocked' | 'pass';
  }[];
  generatedBy: string;
  manifest: string;
  ok: boolean;
  summary: BackendRouteManifestSummary;
};

const DEFAULT_LOCAL_BACKEND_ORIGIN = 'http://localhost:7820';

function getServerBackendInternalAuthorization() {
  if (typeof window !== 'undefined') {
    return null;
  }

  const token = process.env.BACKEND_INTERNAL_TOKEN?.trim();

  return token ? `Bearer ${token}` : null;
}

function withServerBackendInternalAuthorization(
  init: InternalApiFetchInit,
  defaultHeaders?: HeadersInit
) {
  const authorization = getServerBackendInternalAuthorization();

  if (!authorization) {
    return init;
  }

  const headers = new Headers(defaultHeaders);

  if (init.headers) {
    const initHeaders = new Headers(init.headers);
    initHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  if (!headers.has('authorization')) {
    headers.set('authorization', authorization);
  }

  return {
    ...init,
    headers,
  };
}

function resolveConfiguredBackendOrigin(value?: string) {
  if (!value) {
    return null;
  }

  const [firstValue] = value
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!firstValue) {
    return null;
  }

  const normalized = /^[a-z]+:\/\//iu.test(firstValue)
    ? firstValue
    : `https://${firstValue}`;

  try {
    return new URL(normalized).origin;
  } catch {
    return null;
  }
}

export function getConfiguredBackendApiBaseUrl() {
  if (typeof window === 'undefined') {
    return (
      resolveConfiguredBackendOrigin(process.env.BACKEND_INTERNAL_URL) ??
      resolveConfiguredBackendOrigin(process.env.BACKEND_PUBLIC_ORIGIN) ??
      resolveConfiguredBackendOrigin(process.env.NEXT_PUBLIC_BACKEND_URL) ??
      DEFAULT_LOCAL_BACKEND_ORIGIN
    );
  }

  return (
    resolveConfiguredBackendOrigin(process.env.BACKEND_PUBLIC_ORIGIN) ??
    resolveConfiguredBackendOrigin(process.env.NEXT_PUBLIC_BACKEND_URL) ??
    DEFAULT_LOCAL_BACKEND_ORIGIN
  );
}

export function createBackendApiClient(options: InternalApiClientOptions = {}) {
  return createInternalApiClient({
    baseUrl: getConfiguredBackendApiBaseUrl(),
    ...options,
  });
}

export function getBackendLegacyHealth(options: InternalApiClientOptions = {}) {
  return createBackendApiClient(options).json<BackendLegacyHealth>(
    '/api/health',
    {
      cache: 'no-store',
    }
  );
}

export function getBackendMigrationStatus(
  options: InternalApiClientOptions = {}
) {
  return createBackendApiClient(options).json<BackendMigrationStatus>(
    '/api/migration/status',
    withServerBackendInternalAuthorization(
      {
        cache: 'no-store',
      },
      options.defaultHeaders
    )
  );
}

export function getBackendMigrationManifest(
  options: InternalApiClientOptions = {}
) {
  return createBackendApiClient(options).json<BackendMigrationManifest>(
    '/api/migration/manifest',
    withServerBackendInternalAuthorization(
      {
        cache: 'no-store',
      },
      options.defaultHeaders
    )
  );
}

export function getBackendMigrationProgress(
  options: InternalApiClientOptions = {}
) {
  return createBackendApiClient(options).json<BackendMigrationProgress>(
    '/api/migration/progress',
    withServerBackendInternalAuthorization(
      {
        cache: 'no-store',
      },
      options.defaultHeaders
    )
  );
}

export function getBackendMigrationCutoverGates(
  options: InternalApiClientOptions = {}
) {
  return createBackendApiClient(options).json<BackendMigrationCutoverGates>(
    '/api/migration/cutover-gates',
    withServerBackendInternalAuthorization(
      {
        cache: 'no-store',
      },
      options.defaultHeaders
    )
  );
}
