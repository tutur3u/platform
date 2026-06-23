import type { AbuseEvent, VietnameseHoliday } from '@tuturuuu/types';
import type {
  InternalOtpClient,
  InternalOtpPlatform,
  OtpSettingsResponse,
} from './auth';
import {
  createInternalApiClient,
  encodePathSegment,
  type InternalApiClientOptions,
  type InternalApiFetchInit,
  type InternalApiQuery,
  withForwardedInternalApiAuth,
} from './client';
import type {
  CreateSupportInquiryPayload,
  CurrentUserDefaultWorkspaceResponse,
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

export type BackendSupabaseAuthUser = {
  app_metadata?: Record<string, unknown>;
  aud?: string;
  email?: string | null;
  id?: string;
  user_metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export type BackendAuthMeResponse = {
  user: BackendSupabaseAuthUser;
};

export type BackendAuthMfaAssuranceLevel = {
  currentAuthenticationMethods: Record<string, unknown>[];
  currentLevel: string | null;
  nextLevel: string | null;
};

export type BackendAuthMfaFactor = {
  factor_type: string;
  friendly_name?: string | null;
  id: string;
  status: string;
  [key: string]: unknown;
};

export type BackendAuthMfaFactorsResponse = {
  all: BackendAuthMfaFactor[];
  phone: BackendAuthMfaFactor[];
  totp: BackendAuthMfaFactor[];
  webauthn: BackendAuthMfaFactor[];
};

export type BackendCalendarMockEvent = {
  end_at: string;
  id: number;
  start_at: string;
  title: string;
};

export type BackendCalendarMockResponse = {
  data: BackendCalendarMockEvent[];
};

export type BackendUserFieldTypeId =
  | 'TEXT'
  | 'NUMBER'
  | 'BOOLEAN'
  | 'DATE'
  | 'DATETIME';

export type BackendUserFieldType = {
  id: BackendUserFieldTypeId;
};

export type BackendAiWhitelistMeResponse = {
  email: string | null;
  enabled: boolean;
};

export type BackendInfrastructureAbuseEvent = Pick<
  AbuseEvent,
  | 'created_at'
  | 'email'
  | 'email_hash'
  | 'endpoint'
  | 'event_type'
  | 'id'
  | 'ip_address'
  | 'metadata'
  | 'success'
  | 'user_agent'
>;

export type BackendInfrastructureAbuseEventsQuery = {
  page?: number | string;
  pageSize?: number | string;
  q?: string;
  success?: string;
  type?: string;
};

export type BackendInfrastructureAbuseEventsResponse = {
  count: number | null;
  data: BackendInfrastructureAbuseEvent[];
  page: number | null;
  pageSize: number | null;
  totalPages: number | null;
};

export type BackendInfrastructureTimezone = {
  abbr: string;
  created_at: string;
  id: string;
  isdst: boolean;
  offset: number;
  text: string;
  utc: string[];
  value: string;
};

export type BackendInfrastructureTimezoneCreateRequest = {
  abbr?: string;
  id?: string | null;
  isdst?: boolean;
  offset?: number;
  text?: string;
  utc?: string[] | string;
  value?: string;
};

export type BackendInfrastructureTimezoneWriteRequest = Omit<
  BackendInfrastructureTimezoneCreateRequest,
  'id'
>;

export type BackendInfrastructureTimezonesMessage = {
  message: string;
};

export type BackendVietnameseHoliday = VietnameseHoliday;

export type BackendInternalHolidaysQuery = {
  year?: number | string;
};

export type BackendInternalHolidayCreateRequest = {
  date: string;
  name: string;
};

export type BackendInternalHolidayUpdateRequest =
  Partial<BackendInternalHolidayCreateRequest>;

export type BackendInternalHolidayBulkImportItem =
  BackendInternalHolidayCreateRequest;

export type BackendInternalHolidayBulkImportRequest = {
  holidays: BackendInternalHolidayBulkImportItem[];
  replaceExisting?: boolean;
};

export type BackendInternalHolidayBulkImportResponse = {
  imported: number;
  message: string;
  yearsAffected: number[];
};

export type BackendInternalHolidayMutationMessage = {
  message: string;
};

export type BackendInfrastructureEmailBlacklistEntryType = 'domain' | 'email';

export type BackendInfrastructureEmailBlacklistEntry = {
  added_by_user_id?: string | null;
  created_at: string;
  entry_type: BackendInfrastructureEmailBlacklistEntryType;
  id: string;
  reason?: string | null;
  updated_at: string;
  value: string;
  users?: {
    display_name: string | null;
    id: string;
  } | null;
};

export type BackendInfrastructureEmailBlacklistCreateRequest = {
  entry_type: BackendInfrastructureEmailBlacklistEntryType;
  reason?: string | null;
  value: string;
};

export type BackendInfrastructureEmailBlacklistUpdateRequest = {
  reason?: string | null;
};

export type BackendInfrastructureEmailBlacklistDeleteResponse = {
  message: string;
};

export type BackendInfrastructurePostEmailQueueStatusCount = {
  blocked: number;
  cancelled: number;
  failed: number;
  processing: number;
  queued: number;
  sent: number;
  total: number;
};

export type BackendInfrastructurePostEmailQueueWorkspaceSummary =
  BackendInfrastructurePostEmailQueueStatusCount & {
    ws_id: string;
  };

export type BackendInfrastructurePostEmailQueueBatchSummary = {
  batch_id: string;
  claimed: number;
  failed: number;
  last_attempt_at: string | null;
  sent: number;
};

export type BackendInfrastructurePostEmailQueueResponse = {
  byWorkspace: BackendInfrastructurePostEmailQueueWorkspaceSummary[];
  recentBatches: BackendInfrastructurePostEmailQueueBatchSummary[];
  summary: BackendInfrastructurePostEmailQueueStatusCount;
};

export type BackendNovaCurrentTeamResponse = {
  teamId: string | null;
};

export type BackendHiveAccessResponse = {
  hasAccess: boolean;
  isAdmin: boolean;
  isMember: boolean;
};

export type BackendTaskBoardStatus =
  | 'documents'
  | 'not_started'
  | 'active'
  | 'review'
  | 'done'
  | 'closed';

export type BackendTaskBoardStatusDefinition = {
  allow_multiple?: boolean;
  color?: string;
  name?: string;
  status?: BackendTaskBoardStatus;
  [key: string]: unknown;
};

export type BackendTaskBoardStatusTemplate = {
  created_at: string | null;
  description: string | null;
  id: string;
  is_default: boolean | null;
  name: string;
  statuses: BackendTaskBoardStatusDefinition[];
  updated_at: string | null;
  [key: string]: unknown;
};

export type BackendTaskBoardStatusTemplatesResponse = {
  templates: BackendTaskBoardStatusTemplate[];
};

export type BackendOtpSettingsRequest = {
  client: InternalOtpClient;
  platform?: InternalOtpPlatform;
};

export type BackendOtpSettingsResponse = OtpSettingsResponse;

export type BackendOnboardingProgress = {
  completed_at?: string | null;
  completed_steps?: string[];
  current_step?: string;
  flow_type?: string | null;
  id?: string;
  invited_emails?: string[];
  language_preference?: string | null;
  notifications_enabled?: boolean;
  profile_completed?: boolean;
  team_workspace_id?: string | null;
  theme_preference?: string | null;
  tour_completed?: boolean;
  use_case?: string | null;
  user_id?: string;
  workspace_avatar_url?: string | null;
  workspace_description?: string | null;
  workspace_name?: string | null;
  [key: string]: unknown;
};

export type BackendOnboardingProgressResponse =
  BackendOnboardingProgress | null;

export type BackendCurrentUserDefaultWorkspaceResponse =
  CurrentUserDefaultWorkspaceResponse;

export type BackendCreateSupportInquiryResponse = {
  inquiryId: string;
  success: true;
};

export type BackendWorkspacePostPermissions = {
  canApprovePosts: boolean;
  canForceSendPosts: boolean;
};

export type BackendWorkspacePermissionCheck = {
  hasPermission: boolean;
};

export type BackendWorkspaceCrawlerStatus = {
  crawledUrl: Record<string, unknown> | null;
  relatedUrls: Record<string, unknown>[];
};

export type BackendWorkspaceLimits = {
  canCreate: boolean;
  currentCount: number;
  limit: number;
  remaining: number | null;
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

function workspacePathSegment(wsId: string) {
  return encodeURIComponent(wsId);
}

function backendPathSegment(value: string) {
  return encodePathSegment(value);
}

export function getBackendLegacyHealth(options: BackendApiClientOptions = {}) {
  return createBackendApiClient(options).json<BackendLegacyHealth>(
    '/api/health',
    {
      cache: 'no-store',
    }
  );
}

export function getBackendAuthMe(options: BackendApiClientOptions = {}) {
  return createBackendApiClient(options).json<BackendAuthMeResponse>(
    '/api/auth/me',
    {
      cache: 'no-store',
    }
  );
}

export function getBackendAuthMfaAssuranceLevel(
  options: BackendApiClientOptions = {}
) {
  return createBackendApiClient(options).json<BackendAuthMfaAssuranceLevel>(
    '/api/auth/mfa/totp/assurance-level',
    {
      cache: 'no-store',
    }
  );
}

export function getBackendAuthMfaTotpFactors(
  options: BackendApiClientOptions = {}
) {
  return createBackendApiClient(options).json<BackendAuthMfaFactorsResponse>(
    '/api/auth/mfa/totp/factors',
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

export function getBackendCurrentUserDefaultWorkspace(
  options: BackendApiClientOptions = {}
) {
  return createBackendApiClient(
    options
  ).json<BackendCurrentUserDefaultWorkspaceResponse>(
    '/api/v1/users/me/default-workspace',
    {
      cache: 'no-store',
    }
  );
}

export function getBackendCalendarMock(options: BackendApiClientOptions = {}) {
  return createBackendApiClient(options).json<BackendCalendarMockResponse>(
    '/api/v1/calendar/mock',
    {
      cache: 'no-store',
    }
  );
}

export function getBackendOtpSettings(
  payload: BackendOtpSettingsRequest,
  options: BackendApiClientOptions = {}
) {
  return createBackendApiClient(options).json<BackendOtpSettingsResponse>(
    '/api/v1/auth/otp/settings',
    {
      cache: 'no-store',
      query: payload,
    }
  );
}

export function getBackendOnboardingProgress(
  options: BackendApiClientOptions = {}
) {
  return createBackendApiClient(
    options
  ).json<BackendOnboardingProgressResponse>(
    '/api/v1/user/onboarding-progress',
    {
      cache: 'no-store',
    }
  );
}

export function getBackendUserFieldTypes(
  options: BackendApiClientOptions = {}
) {
  return createBackendApiClient(options).json<BackendUserFieldType[]>(
    '/api/v1/infrastructure/users/fields/types',
    {
      cache: 'no-store',
    }
  );
}

export function getBackendAiWhitelistMe(options: BackendApiClientOptions = {}) {
  return createBackendApiClient(options).json<BackendAiWhitelistMeResponse>(
    '/api/v1/ai/whitelist/me',
    {
      cache: 'no-store',
    }
  );
}

export function getBackendInfrastructureAbuseEvents(
  query: BackendInfrastructureAbuseEventsQuery = {},
  options: BackendApiClientOptions = {}
) {
  const apiQuery: InternalApiQuery = {
    ip: query.q || undefined,
    page: query.page,
    pageSize: query.pageSize,
    success: query.success || undefined,
    type: query.type || undefined,
  };

  return createBackendApiClient(
    options
  ).json<BackendInfrastructureAbuseEventsResponse>(
    '/api/v1/infrastructure/abuse-events',
    {
      cache: 'no-store',
      query: apiQuery,
    }
  );
}

export function getBackendInfrastructureTimezones(
  options: BackendApiClientOptions = {}
) {
  return createBackendApiClient(options).json<BackendInfrastructureTimezone[]>(
    '/api/v1/infrastructure/timezones',
    {
      cache: 'no-store',
    }
  );
}

export function createBackendInfrastructureTimezone(
  payload: BackendInfrastructureTimezoneCreateRequest,
  options: BackendApiClientOptions = {}
) {
  const clientOptions = resolveBackendApiClientOptions(options);

  return createBackendApiClient(
    clientOptions
  ).json<BackendInfrastructureTimezonesMessage>(
    '/api/v1/infrastructure/timezones',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: withBackendSameOriginMutationHeaders(clientOptions, {
        'Content-Type': 'application/json',
      }),
      method: 'POST',
    }
  );
}

export function updateBackendInfrastructureTimezone(
  timezoneId: string,
  payload: BackendInfrastructureTimezoneWriteRequest,
  options: BackendApiClientOptions = {}
) {
  const clientOptions = resolveBackendApiClientOptions(options);

  return createBackendApiClient(
    clientOptions
  ).json<BackendInfrastructureTimezonesMessage>(
    `/api/v1/infrastructure/timezones/${backendPathSegment(timezoneId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: withBackendSameOriginMutationHeaders(clientOptions, {
        'Content-Type': 'application/json',
      }),
      method: 'PUT',
    }
  );
}

export function deleteBackendInfrastructureTimezone(
  timezoneId: string,
  options: BackendApiClientOptions = {}
) {
  const clientOptions = resolveBackendApiClientOptions(options);

  return createBackendApiClient(
    clientOptions
  ).json<BackendInfrastructureTimezonesMessage>(
    `/api/v1/infrastructure/timezones/${backendPathSegment(timezoneId)}`,
    {
      cache: 'no-store',
      headers: withBackendSameOriginMutationHeaders(clientOptions, {}),
      method: 'DELETE',
    }
  );
}

export function getBackendInternalHolidays(
  query: BackendInternalHolidaysQuery = {},
  options: BackendApiClientOptions = {}
) {
  const apiQuery: InternalApiQuery = {
    year: query.year,
  };

  return createBackendApiClient(options).json<BackendVietnameseHoliday[]>(
    '/api/v1/internal/holidays',
    {
      cache: 'no-store',
      query: apiQuery,
    }
  );
}

export function createBackendInternalHoliday(
  payload: BackendInternalHolidayCreateRequest,
  options: BackendApiClientOptions = {}
) {
  const clientOptions = resolveBackendApiClientOptions(options);

  return createBackendApiClient(clientOptions).json<BackendVietnameseHoliday>(
    '/api/v1/internal/holidays',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: withBackendSameOriginMutationHeaders(clientOptions, {
        'Content-Type': 'application/json',
      }),
      method: 'POST',
    }
  );
}

export function updateBackendInternalHoliday(
  holidayId: string,
  payload: BackendInternalHolidayUpdateRequest,
  options: BackendApiClientOptions = {}
) {
  const clientOptions = resolveBackendApiClientOptions(options);

  return createBackendApiClient(clientOptions).json<BackendVietnameseHoliday>(
    `/api/v1/internal/holidays/${backendPathSegment(holidayId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: withBackendSameOriginMutationHeaders(clientOptions, {
        'Content-Type': 'application/json',
      }),
      method: 'PUT',
    }
  );
}

export function deleteBackendInternalHoliday(
  holidayId: string,
  options: BackendApiClientOptions = {}
) {
  const clientOptions = resolveBackendApiClientOptions(options);

  return createBackendApiClient(
    clientOptions
  ).json<BackendInternalHolidayMutationMessage>(
    `/api/v1/internal/holidays/${backendPathSegment(holidayId)}`,
    {
      cache: 'no-store',
      headers: withBackendSameOriginMutationHeaders(clientOptions, {}),
      method: 'DELETE',
    }
  );
}

export function bulkImportBackendInternalHolidays(
  payload: BackendInternalHolidayBulkImportRequest,
  options: BackendApiClientOptions = {}
) {
  const clientOptions = resolveBackendApiClientOptions(options);

  return createBackendApiClient(
    clientOptions
  ).json<BackendInternalHolidayBulkImportResponse>(
    '/api/v1/internal/holidays/bulk',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: withBackendSameOriginMutationHeaders(clientOptions, {
        'Content-Type': 'application/json',
      }),
      method: 'POST',
    }
  );
}

export function getBackendInfrastructureEmailBlacklistEntries(
  options: BackendApiClientOptions = {}
) {
  return createBackendApiClient(options).json<
    BackendInfrastructureEmailBlacklistEntry[]
  >('/api/v1/infrastructure/email-blacklist', {
    cache: 'no-store',
  });
}

export function getBackendInfrastructureEmailBlacklistEntry(
  entryId: string,
  options: BackendApiClientOptions = {}
) {
  return createBackendApiClient(
    options
  ).json<BackendInfrastructureEmailBlacklistEntry>(
    `/api/v1/infrastructure/email-blacklist/${backendPathSegment(entryId)}`,
    {
      cache: 'no-store',
    }
  );
}

export function createBackendInfrastructureEmailBlacklistEntry(
  payload: BackendInfrastructureEmailBlacklistCreateRequest,
  options: BackendApiClientOptions = {}
) {
  const clientOptions = resolveBackendApiClientOptions(options);

  return createBackendApiClient(
    clientOptions
  ).json<BackendInfrastructureEmailBlacklistEntry>(
    '/api/v1/infrastructure/email-blacklist',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: withBackendSameOriginMutationHeaders(clientOptions, {
        'Content-Type': 'application/json',
      }),
      method: 'POST',
    }
  );
}

export function updateBackendInfrastructureEmailBlacklistEntry(
  entryId: string,
  payload: BackendInfrastructureEmailBlacklistUpdateRequest,
  options: BackendApiClientOptions = {}
) {
  const clientOptions = resolveBackendApiClientOptions(options);

  return createBackendApiClient(
    clientOptions
  ).json<BackendInfrastructureEmailBlacklistEntry>(
    `/api/v1/infrastructure/email-blacklist/${backendPathSegment(entryId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: withBackendSameOriginMutationHeaders(clientOptions, {
        'Content-Type': 'application/json',
      }),
      method: 'PUT',
    }
  );
}

export function deleteBackendInfrastructureEmailBlacklistEntry(
  entryId: string,
  options: BackendApiClientOptions = {}
) {
  const clientOptions = resolveBackendApiClientOptions(options);

  return createBackendApiClient(
    clientOptions
  ).json<BackendInfrastructureEmailBlacklistDeleteResponse>(
    `/api/v1/infrastructure/email-blacklist/${backendPathSegment(entryId)}`,
    {
      cache: 'no-store',
      headers: withBackendSameOriginMutationHeaders(clientOptions, {}),
      method: 'DELETE',
    }
  );
}

export function getBackendInfrastructurePostEmailQueue(
  options: BackendApiClientOptions = {}
) {
  return createBackendApiClient(
    options
  ).json<BackendInfrastructurePostEmailQueueResponse>(
    '/api/v1/infrastructure/post-email-queue',
    {
      cache: 'no-store',
    }
  );
}

export function getBackendNovaCurrentTeam(
  options: BackendApiClientOptions = {}
) {
  return createBackendApiClient(options).json<BackendNovaCurrentTeamResponse>(
    '/api/v1/nova/me/team',
    {
      cache: 'no-store',
    }
  );
}

export function getBackendHiveAccess(options: BackendApiClientOptions = {}) {
  return createBackendApiClient(options).json<BackendHiveAccessResponse>(
    '/api/v1/users/me/hive-access',
    {
      cache: 'no-store',
    }
  );
}

export function getBackendTaskBoardStatusTemplates(
  options: BackendApiClientOptions = {}
) {
  return createBackendApiClient(
    options
  ).json<BackendTaskBoardStatusTemplatesResponse>(
    '/api/v1/task-board-status-templates',
    {
      cache: 'no-store',
    }
  );
}

export function getBackendWorkspacePostPermissions(
  wsId: string,
  options: BackendApiClientOptions = {}
) {
  return createBackendApiClient(options).json<BackendWorkspacePostPermissions>(
    `/api/v1/workspaces/${workspacePathSegment(wsId)}/posts/permissions`,
    {
      cache: 'no-store',
    }
  );
}

export function checkBackendWorkspacePermission(
  wsId: string,
  permission: string,
  options: BackendApiClientOptions = {}
) {
  const searchParams = new URLSearchParams({ permission });

  return createBackendApiClient(options).json<BackendWorkspacePermissionCheck>(
    `/api/v1/workspaces/${workspacePathSegment(wsId)}/settings/permissions/check?${searchParams}`,
    {
      cache: 'no-store',
    }
  );
}

export function getBackendWorkspaceCrawlerStatus(
  wsId: string,
  url: string,
  options: BackendApiClientOptions = {}
) {
  const searchParams = new URLSearchParams({ url });

  return createBackendApiClient(options).json<BackendWorkspaceCrawlerStatus>(
    `/api/v1/workspaces/${workspacePathSegment(wsId)}/crawlers/status?${searchParams}`,
    {
      cache: 'no-store',
    }
  );
}

export function getBackendWorkspaceLimits(
  options: BackendApiClientOptions = {}
) {
  return createBackendApiClient(options).json<BackendWorkspaceLimits>(
    '/api/v1/workspaces/limits',
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
