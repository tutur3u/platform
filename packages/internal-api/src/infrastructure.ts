import { getInternalApiClient, type InternalApiClientOptions } from './client';

export interface MobilePlatformVersionPolicyPayload {
  effectiveVersion: string | null;
  minimumVersion: string | null;
  otpEnabled: boolean;
  storeUrl: string | null;
}

export interface MobileVersionPoliciesPayload {
  android: MobilePlatformVersionPolicyPayload;
  ios: MobilePlatformVersionPolicyPayload;
  webOtpEnabled: boolean;
}

export type InfrastructurePushAppFlavor =
  | 'development'
  | 'production'
  | 'staging';

export type InfrastructurePushDeliveryKind = 'data_only' | 'notification';

export type InfrastructurePushPlatform = 'all' | 'android' | 'ios';

export type BlueGreenMonitoringWatcherHealth =
  | 'live'
  | 'missing'
  | 'offline'
  | 'stale';

export type BlueGreenMonitoringStatus = 'degraded' | 'healthy' | 'offline';

export type BlueGreenMonitoringDockerHealth =
  | 'healthy'
  | 'none'
  | 'starting'
  | 'unknown'
  | 'unhealthy';

export interface BlueGreenMonitoringEvent {
  level: string;
  message: string;
  time: number;
}

export interface BlueGreenMonitoringContainerResource {
  color: string;
  containerId: string;
  cpuPercent: number | null;
  label: string;
  memoryBytes: number | null;
  rxBytes: number | null;
  serviceName: string;
  txBytes: number | null;
}

export interface BlueGreenMonitoringDockerContainer {
  containerId: string;
  cpuPercent: number | null;
  health: BlueGreenMonitoringDockerHealth;
  image: string | null;
  isMonitored: boolean;
  memoryBytes: number | null;
  name: string;
  ports: string | null;
  projectName: string | null;
  runningFor: string | null;
  rxBytes: number | null;
  serviceName: string | null;
  status: string | null;
  txBytes: number | null;
}

export interface BlueGreenMonitoringServiceHealth {
  containerId: string;
  health: BlueGreenMonitoringDockerHealth;
  name: string;
  projectName: string | null;
  serviceName: string;
  status: string | null;
}

export interface BlueGreenMonitoringDeployment {
  activatedAt?: number | null;
  averageLatencyMs?: number | null;
  activeColor?: string | null;
  averageRequestsPerMinute?: number | null;
  buildDurationMs?: number | null;
  commitHash?: string | null;
  commitShortHash?: string | null;
  commitSubject?: string | null;
  dailyAverageRequests?: number | null;
  dailyPeakRequests?: number | null;
  dailyRequestCount?: number | null;
  deploymentKind?: string | null;
  deploymentStamp?: string | null;
  endedAt?: number | null;
  errorCount?: number | null;
  finishedAt?: number | null;
  firstRequestAt?: number | null;
  imageTag?: string | null;
  lastRequestAt?: number | null;
  lifetimeMs?: number | null;
  peakRequestsPerMinute?: number | null;
  requestCount?: number | null;
  runtimeState?: 'active' | 'standby' | null;
  startedAt?: number | null;
  status?: string | null;
}

export interface BlueGreenDeploymentPin {
  activeColor: string | null;
  commitHash: string;
  commitShortHash: string | null;
  commitSubject: string | null;
  deploymentStamp: string | null;
  kind: 'deployment-pin';
  requestedAt: string;
  requestedBy: string;
  requestedByEmail: string | null;
}

export interface BlueGreenInstantRolloutRequest {
  kind: 'sync-standby';
  requestedAt: string;
  requestedBy: string;
  requestedByEmail: string | null;
}

export interface BlueGreenMonitoringPeriodMetric {
  averageLatencyMs: number | null;
  bucketLabel: string;
  bucketStart: number;
  deploymentCount: number;
  errorCount: number;
  errorRate: number;
  peakRequestsPerMinute: number;
  requestCount: number;
  statusCounts: {
    clientError: number;
    informational: number;
    redirect: number;
    serverError: number;
    success: number;
  };
}

export interface BlueGreenMonitoringRequestLog {
  deploymentColor: string | null;
  deploymentKey: string | null;
  deploymentStamp: string | null;
  host: string | null;
  isInternal: boolean;
  method: string | null;
  path: string;
  requestTimeMs: number | null;
  status: number | null;
  time: number;
}

export interface BlueGreenMonitoringWatcherLog {
  activeColor: string | null;
  commitHash: string | null;
  commitShortHash: string | null;
  deploymentKey: string | null;
  deploymentKind: string | null;
  deploymentStamp: string | null;
  deploymentStatus: string | null;
  level: string;
  message: string;
  time: number;
}

export interface BlueGreenMonitoringArchiveWindow {
  newestAt: number | null;
  oldestAt: number | null;
}

export interface BlueGreenMonitoringPaginatedResult<T> {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  items: T[];
  limit: number;
  offset: number;
  page: number;
  pageCount: number;
  total: number;
  window: BlueGreenMonitoringArchiveWindow;
}

export interface BlueGreenMonitoringSnapshot {
  analytics: {
    current: {
      daily: BlueGreenMonitoringPeriodMetric | null;
      monthly: BlueGreenMonitoringPeriodMetric | null;
      weekly: BlueGreenMonitoringPeriodMetric | null;
      yearly: BlueGreenMonitoringPeriodMetric | null;
    };
    recentRequests: BlueGreenMonitoringRequestLog[];
    totalPersistedLogs: number;
    trends: {
      daily: BlueGreenMonitoringPeriodMetric[];
      monthly: BlueGreenMonitoringPeriodMetric[];
      weekly: BlueGreenMonitoringPeriodMetric[];
      yearly: BlueGreenMonitoringPeriodMetric[];
    };
  };
  control: {
    deploymentPin: BlueGreenDeploymentPin | null;
    instantRolloutRequest: BlueGreenInstantRolloutRequest | null;
  };
  deployments: BlueGreenMonitoringDeployment[];
  recoveryCache: {
    deployments: BlueGreenMonitoringDeployment[];
    limit: number;
    total: number;
  };
  dockerResources: {
    allContainers: BlueGreenMonitoringDockerContainer[];
    containers: BlueGreenMonitoringContainerResource[];
    message: string | null;
    serviceHealth: BlueGreenMonitoringServiceHealth[];
    state: string;
    totalCpuPercent: number;
    totalMemoryBytes: number;
    totalRxBytes: number;
    totalTxBytes: number;
  };
  overview: {
    averageBuildDurationMs: number | null;
    currentAverageRequestsPerMinute: number | null;
    currentPeakRequestsPerMinute: number | null;
    currentRequestCount: number | null;
    failedDeployments: number;
    successfulDeployments: number;
    totalDeployments: number;
    totalPersistedLogs: number;
    totalRequestsServed: number;
  };
  runtime: {
    activatedAt: number | null;
    activeColor: string | null;
    averageRequestsPerMinute: number | null;
    dailyAverageRequests: number | null;
    dailyPeakRequests: number | null;
    dailyRequestCount: number | null;
    deploymentStamp: string | null;
    lifetimeMs: number | null;
    liveColors: string[];
    peakRequestsPerMinute: number | null;
    requestCount: number | null;
    serviceContainers: Record<string, string>;
    standbyColor: string | null;
    state: string;
  };
  source: {
    historyAvailable: boolean;
    monitoringDirAvailable: boolean;
    statusAvailable: boolean;
  };
  watcher: {
    args: string[];
    events: BlueGreenMonitoringEvent[];
    health: BlueGreenMonitoringWatcherHealth;
    intervalMs: number | null;
    lastCheckAt: number | null;
    lastDeployAt: number | null;
    lastDeployStatus: string | null;
    logs: BlueGreenMonitoringWatcherLog[];
    lastResult: Record<string, unknown> | null;
    latestCommit: {
      committedAt: string | null;
      hash: string | null;
      shortHash: string | null;
      subject: string | null;
    } | null;
    lock: {
      branch: string | null;
      createdAt: string | null;
      upstreamRef: string | null;
    } | null;
    nextCheckAt: number | null;
    status: BlueGreenMonitoringStatus;
    target: {
      branch: string | null;
      upstreamRef: string | null;
    } | null;
    updatedAt: number | null;
  };
}

export interface RequestBlueGreenInstantRolloutResponse {
  message: string;
  request: BlueGreenInstantRolloutRequest;
}

export interface PinBlueGreenDeploymentPayload {
  commitHash: string;
}

export interface PinBlueGreenDeploymentResponse {
  message: string;
  pin: BlueGreenDeploymentPin;
}

export interface ClearBlueGreenDeploymentPinResponse {
  message: string;
}

export interface SendInfrastructurePushTestPayload {
  appFlavor: InfrastructurePushAppFlavor;
  body: string;
  data?: Record<string, string>;
  deliveryKind: InfrastructurePushDeliveryKind;
  deviceId?: string;
  platform: InfrastructurePushPlatform;
  sendToAll: boolean;
  title: string;
  token?: string;
  userId?: string;
}

export interface SendInfrastructurePushTestResponse {
  deliveredCount: number;
  invalidTokens: string[];
  invalidTokensRemoved: number;
  matchedDevices: number;
  message: string;
  success: true;
  truncated: boolean;
}

export interface GetBlueGreenMonitoringSnapshotParams {
  requestPreviewLimit?: number;
  watcherLogLimit?: number;
}

export interface GetBlueGreenMonitoringArchiveParams {
  page?: number;
  pageSize?: number;
}

export async function sendInfrastructurePushTest(
  payload: SendInfrastructurePushTestPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<SendInfrastructurePushTestResponse>(
    '/api/v1/infrastructure/push-notifications/test',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    }
  );
}

export async function updateMobileVersionPolicies(
  payload: MobileVersionPoliciesPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<{
    data: MobileVersionPoliciesPayload;
    message: string;
  }>('/api/v1/infrastructure/mobile-versions', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  });
}

export async function getBlueGreenMonitoringSnapshot(
  params?: GetBlueGreenMonitoringSnapshotParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();

  if (params?.requestPreviewLimit != null) {
    searchParams.set('requestPreviewLimit', String(params.requestPreviewLimit));
  }

  if (params?.watcherLogLimit != null) {
    searchParams.set('watcherLogLimit', String(params.watcherLogLimit));
  }

  return client.json<BlueGreenMonitoringSnapshot>(
    `/api/v1/infrastructure/monitoring/blue-green${
      searchParams.size > 0 ? `?${searchParams.toString()}` : ''
    }`,
    {
      cache: 'no-store',
    }
  );
}

export async function getBlueGreenMonitoringRequestArchive(
  params?: GetBlueGreenMonitoringArchiveParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();

  if (params?.page != null) {
    searchParams.set('page', String(params.page));
  }

  if (params?.pageSize != null) {
    searchParams.set('pageSize', String(params.pageSize));
  }

  return client.json<
    BlueGreenMonitoringPaginatedResult<BlueGreenMonitoringRequestLog>
  >(
    `/api/v1/infrastructure/monitoring/blue-green/requests${
      searchParams.size > 0 ? `?${searchParams.toString()}` : ''
    }`,
    {
      cache: 'no-store',
    }
  );
}

export async function getBlueGreenMonitoringWatcherLogArchive(
  params?: GetBlueGreenMonitoringArchiveParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  const searchParams = new URLSearchParams();

  if (params?.page != null) {
    searchParams.set('page', String(params.page));
  }

  if (params?.pageSize != null) {
    searchParams.set('pageSize', String(params.pageSize));
  }

  return client.json<
    BlueGreenMonitoringPaginatedResult<BlueGreenMonitoringWatcherLog>
  >(
    `/api/v1/infrastructure/monitoring/blue-green/watcher-logs${
      searchParams.size > 0 ? `?${searchParams.toString()}` : ''
    }`,
    {
      cache: 'no-store',
    }
  );
}

export async function requestBlueGreenInstantRollout(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RequestBlueGreenInstantRolloutResponse>(
    '/api/v1/infrastructure/monitoring/blue-green/instant-rollout',
    {
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function pinBlueGreenDeployment(
  payload: PinBlueGreenDeploymentPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<PinBlueGreenDeploymentResponse>(
    '/api/v1/infrastructure/monitoring/blue-green/deployment-pin',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'POST',
    }
  );
}

export async function clearBlueGreenDeploymentPin(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ClearBlueGreenDeploymentPinResponse>(
    '/api/v1/infrastructure/monitoring/blue-green/deployment-pin',
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}
