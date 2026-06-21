import {
  createInternalApiClient,
  type InternalApiClientOptions,
  type InternalApiFetchInit,
  withForwardedInternalApiAuth,
} from './client';
import type {
  CreateSupportInquiryPayload,
  CurrentUserProfileResponse,
} from './users';

export type BackendMigrationStatus = {
  backend: {
    deploymentTarget: string;
    runtime: string;
    service: string;
    toolchain: string;
  };
  contactData: {
    configured: boolean;
    missing: string[];
    supabaseOrigin: string | null;
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

export type BackendCreateSupportInquiryResponse = {
  inquiryId: string;
  success: true;
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

export type BackendServiceBinding = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};
export type BackendApiClientOptions = InternalApiClientOptions & {
  serviceBinding?: BackendServiceBinding | null;
};

const BACKEND_SERVICE_BINDING_ORIGIN =
  'https://backend.service.tuturuuu.internal';
const DEFAULT_LOCAL_BACKEND_ORIGIN = 'http://localhost:7820';
const LOCAL_PLAINTEXT_BACKEND_HOSTS = new Set([
  '0.0.0.0',
  '127.0.0.1',
  '[::1]',
  '::1',
  'localhost',
]);
const INTERNAL_PLAINTEXT_BACKEND_HOSTS = new Set([
  'backend',
  'host.docker.internal',
]);
const CONTACT_SERVER_FUNCTION_REFERER_PATH =
  '/tanstack-contact-server-function';

type RequestHeaderAccessor = Pick<Headers, 'get'>;

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

function isLocalPlaintextBackendHost(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();

  return (
    LOCAL_PLAINTEXT_BACKEND_HOSTS.has(normalizedHostname) ||
    normalizedHostname.endsWith('.localhost') ||
    normalizedHostname.startsWith('127.')
  );
}

function isAllowedPlaintextBackendHost(
  hostname: string,
  allowInternalPlaintextHosts: boolean
) {
  const normalizedHostname = hostname.toLowerCase();

  return (
    isLocalPlaintextBackendHost(normalizedHostname) ||
    (allowInternalPlaintextHosts &&
      INTERNAL_PLAINTEXT_BACKEND_HOSTS.has(normalizedHostname))
  );
}

function resolveConfiguredBackendOrigin(
  value?: string,
  options: { allowInternalPlaintextHosts?: boolean } = {}
) {
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
    const parsedUrl = new URL(normalized);

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      return null;
    }

    if (parsedUrl.username || parsedUrl.password) {
      return null;
    }

    if (parsedUrl.pathname !== '/' || parsedUrl.search || parsedUrl.hash) {
      return null;
    }

    if (
      parsedUrl.protocol === 'http:' &&
      !isAllowedPlaintextBackendHost(
        parsedUrl.hostname,
        options.allowInternalPlaintextHosts ?? false
      )
    ) {
      return null;
    }

    return parsedUrl.origin;
  } catch {
    return null;
  }
}

export function getConfiguredBackendApiBaseUrl() {
  if (typeof window === 'undefined') {
    return (
      resolveConfiguredBackendOrigin(process.env.BACKEND_INTERNAL_URL, {
        allowInternalPlaintextHosts: true,
      }) ??
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

function createBackendServiceBindingFetch(
  serviceBinding: BackendServiceBinding
): typeof fetch {
  return (input, init) => serviceBinding.fetch(new Request(input, init));
}

function resolveBackendApiClientOptions(
  options: BackendApiClientOptions = {}
): InternalApiClientOptions {
  const { serviceBinding, ...clientOptions } = options;

  if (typeof window !== 'undefined' || !serviceBinding) {
    return clientOptions;
  }

  return {
    ...clientOptions,
    baseUrl: clientOptions.baseUrl ?? BACKEND_SERVICE_BINDING_ORIGIN,
    fetch:
      clientOptions.fetch ?? createBackendServiceBindingFetch(serviceBinding),
  };
}

export function withBackendServiceBinding(
  serviceBinding: BackendServiceBinding | null | undefined,
  options: BackendApiClientOptions = {}
): BackendApiClientOptions {
  if (!serviceBinding || typeof window !== 'undefined') {
    return options;
  }

  return {
    ...options,
    serviceBinding,
  };
}

export function createBackendApiClient(options: BackendApiClientOptions = {}) {
  const clientOptions = resolveBackendApiClientOptions(options);

  return createInternalApiClient({
    baseUrl: clientOptions.baseUrl ?? getConfiguredBackendApiBaseUrl(),
    ...clientOptions,
  });
}

export function withForwardedBackendApiAuth(
  requestHeaders: RequestHeaderAccessor,
  options: BackendApiClientOptions = {}
) {
  const clientOptions = resolveBackendApiClientOptions(options);

  return withForwardedInternalApiAuth(requestHeaders, {
    ...clientOptions,
    baseUrl: clientOptions.baseUrl ?? getConfiguredBackendApiBaseUrl(),
  });
}

function withBackendSameOriginMutationHeaders(
  options: BackendApiClientOptions,
  headers: HeadersInit
) {
  const requestHeaders = new Headers(options.defaultHeaders);
  const headersToMerge = new Headers(headers);
  headersToMerge.forEach((value, key) => {
    requestHeaders.set(key, value);
  });

  if (typeof window === 'undefined') {
    const backendOrigin = options.baseUrl ?? getConfiguredBackendApiBaseUrl();

    if (!requestHeaders.has('origin')) {
      requestHeaders.set('origin', backendOrigin);
    }

    if (!requestHeaders.has('referer')) {
      requestHeaders.set(
        'referer',
        new URL(CONTACT_SERVER_FUNCTION_REFERER_PATH, backendOrigin).toString()
      );
    }
  }

  return requestHeaders;
}

export function getBackendLegacyHealth(options: BackendApiClientOptions = {}) {
  return createBackendApiClient(options).json<BackendLegacyHealth>(
    '/api/health',
    {
      cache: 'no-store',
    }
  );
}

export function getBackendCurrentUserProfile(
  options: BackendApiClientOptions = {}
) {
  return createBackendApiClient(options).json<CurrentUserProfileResponse>(
    '/api/v1/users/me/profile',
    {
      cache: 'no-store',
    }
  );
}

export function createBackendSupportInquiry(
  payload: CreateSupportInquiryPayload,
  options: BackendApiClientOptions = {}
) {
  const clientOptions = resolveBackendApiClientOptions(options);

  return createBackendApiClient(
    clientOptions
  ).json<BackendCreateSupportInquiryResponse>('/api/v1/inquiries', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: withBackendSameOriginMutationHeaders(clientOptions, {
      'Content-Type': 'application/json',
    }),
    method: 'POST',
  });
}

export function getBackendMigrationStatus(
  options: BackendApiClientOptions = {}
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
  options: BackendApiClientOptions = {}
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
  options: BackendApiClientOptions = {}
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
  options: BackendApiClientOptions = {}
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
