import {
  encodePathSegment,
  getInternalApiClient,
  type InternalApiClientOptions,
} from '../client';
import type {
  AbortInfrastructureStressTestPayload,
  AbortInfrastructureStressTestResponse,
  BlueGreenMonitoringPaginatedResult,
  BlueGreenMonitoringRequestArchive,
  BlueGreenMonitoringSnapshot,
  BlueGreenMonitoringWatcherLog,
  ClearBlueGreenDeploymentPinResponse,
  CreateInfrastructureProjectPayload,
  CronExecutionRecord,
  CronMonitoringSnapshot,
  GetBlueGreenMonitoringArchiveParams,
  GetBlueGreenMonitoringRequestArchiveParams,
  GetBlueGreenMonitoringSnapshotParams,
  GetCronMonitoringExecutionArchiveParams,
  GetObservabilityParams,
  InfrastructureProjectResponse,
  InfrastructureProjectsResponse,
  InfrastructureStressTestRun,
  InfrastructureStressTestSnapshot,
  ObservabilityAnalytics,
  ObservabilityCronRun,
  ObservabilityDeployment,
  ObservabilityLogsResult,
  ObservabilityOverview,
  ObservabilityPaginatedResult,
  ObservabilityRequest,
  ObservabilityResources,
  PinBlueGreenDeploymentPayload,
  PinBlueGreenDeploymentResponse,
  QueueCronRunPayload,
  QueueCronRunResponse,
  QueueInfrastructureStressTestPayload,
  QueueInfrastructureStressTestResponse,
  RequestBlueGreenDeploymentRevertPayload,
  RequestBlueGreenDeploymentRevertResponse,
  RequestBlueGreenInstantRolloutResponse,
  RequestBlueGreenWatcherRecoveryPayload,
  RequestBlueGreenWatcherRecoveryResponse,
  RequestCronRunnerRecoveryPayload,
  RequestCronRunnerRecoveryResponse,
  RunManagedExternalCronPayload,
  RunManagedExternalCronResponse,
  UpdateBlueGreenDockerRecoverySettingsPayload,
  UpdateBlueGreenDockerRecoverySettingsResponse,
  UpdateCronMonitoringControlPayload,
  UpdateCronMonitoringControlResponse,
  UpdateInfrastructureProjectPayload,
  UpdateManagedExternalCronJobPayload,
  UpdateManagedExternalCronJobResponse,
} from './types';

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
  params?: GetBlueGreenMonitoringRequestArchiveParams,
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

  if (params?.timeframeDays != null) {
    searchParams.set('timeframeDays', String(params.timeframeDays));
  }

  if (params?.q) {
    searchParams.set('q', params.q);
  }

  if (params?.status && params.status !== 'all') {
    searchParams.set('status', params.status);
  }

  if (params?.route && params.route !== 'all') {
    searchParams.set('route', params.route);
  }

  if (params?.since != null) {
    searchParams.set('since', String(params.since));
  }

  if (params?.render && params.render !== 'all') {
    searchParams.set('render', params.render);
  }

  if (params?.traffic && params.traffic !== 'all') {
    searchParams.set('traffic', params.traffic);
  }

  if (params?.until != null) {
    searchParams.set('until', String(params.until));
  }

  return client.json<BlueGreenMonitoringRequestArchive>(
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

export async function getCronMonitoringSnapshot(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<CronMonitoringSnapshot>(
    '/api/v1/infrastructure/monitoring/cron',
    {
      cache: 'no-store',
    }
  );
}

export async function getCronMonitoringExecutionArchive(
  params?: GetCronMonitoringExecutionArchiveParams,
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

  if (params?.jobId) {
    searchParams.set('jobId', params.jobId);
  }

  return client.json<BlueGreenMonitoringPaginatedResult<CronExecutionRecord>>(
    `/api/v1/infrastructure/monitoring/cron/executions${
      searchParams.size > 0 ? `?${searchParams.toString()}` : ''
    }`,
    {
      cache: 'no-store',
    }
  );
}

export async function queueCronRun(
  payload: QueueCronRunPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<QueueCronRunResponse>(
    '/api/v1/infrastructure/monitoring/cron/run',
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

export async function runManagedExternalCronJob(
  payload: RunManagedExternalCronPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RunManagedExternalCronResponse>(
    '/api/v1/infrastructure/monitoring/cron/managed/run',
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

export async function updateManagedExternalCronJob(
  payload: UpdateManagedExternalCronJobPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<UpdateManagedExternalCronJobResponse>(
    '/api/v1/infrastructure/monitoring/cron/managed/job',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    }
  );
}

export async function updateCronMonitoringControl(
  payload: UpdateCronMonitoringControlPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<UpdateCronMonitoringControlResponse>(
    '/api/v1/infrastructure/monitoring/cron/control',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PUT',
    }
  );
}

export async function getInfrastructureStressTestSnapshot(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InfrastructureStressTestSnapshot>(
    '/api/v1/infrastructure/monitoring/stress-tests',
    {
      cache: 'no-store',
    }
  );
}

export async function requestCronRunnerRecovery(
  payload: RequestCronRunnerRecoveryPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RequestCronRunnerRecoveryResponse>(
    '/api/v1/infrastructure/monitoring/cron/runner-recovery',
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

export async function queueInfrastructureStressTest(
  payload: QueueInfrastructureStressTestPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<QueueInfrastructureStressTestResponse>(
    '/api/v1/infrastructure/monitoring/stress-tests',
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

export async function getInfrastructureStressTestRun(
  runId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InfrastructureStressTestRun>(
    `/api/v1/infrastructure/monitoring/stress-tests/${encodePathSegment(
      runId
    )}`,
    {
      cache: 'no-store',
    }
  );
}

export async function abortInfrastructureStressTest(
  runId: string,
  payload: AbortInfrastructureStressTestPayload = {},
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<AbortInfrastructureStressTestResponse>(
    `/api/v1/infrastructure/monitoring/stress-tests/${encodePathSegment(
      runId
    )}/abort`,
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

function appendObservabilitySearchParams(
  searchParams: URLSearchParams,
  params?: GetObservabilityParams
) {
  if (params?.page != null) {
    searchParams.set('page', String(params.page));
  }

  if (params?.pageSize != null) {
    searchParams.set('pageSize', String(params.pageSize));
  }

  if (params?.projectId) {
    searchParams.set('projectId', params.projectId);
  }

  if (params?.timeframeHours != null) {
    searchParams.set('timeframeHours', String(params.timeframeHours));
  }

  if (params?.q) {
    searchParams.set('q', params.q);
  }

  if (params?.route && params.route !== 'all') {
    searchParams.set('route', params.route);
  }

  if (params?.requestId) {
    searchParams.set('requestId', params.requestId);
  }

  if (params?.user) {
    searchParams.set('user', params.user);
  }

  if (params?.deploymentStamp) {
    searchParams.set('deploymentStamp', params.deploymentStamp);
  }

  if (params?.since != null) {
    searchParams.set('since', String(params.since));
  }

  if (params?.until != null) {
    searchParams.set('until', String(params.until));
  }

  if (params?.level && params.level !== 'all') {
    searchParams.set('level', params.level);
  }

  if (params?.source && params.source !== 'all') {
    searchParams.set('source', params.source);
  }

  if (params?.status && params.status !== 'all') {
    searchParams.set('status', params.status);
  }
}

function getObservabilityPath(path: string, params?: GetObservabilityParams) {
  const searchParams = new URLSearchParams();
  appendObservabilitySearchParams(searchParams, params);
  return `/api/v1/infrastructure/observability/${path}${
    searchParams.size > 0 ? `?${searchParams.toString()}` : ''
  }`;
}

export async function getObservabilityOverview(
  params?: Pick<GetObservabilityParams, 'projectId' | 'timeframeHours'>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ObservabilityOverview>(
    getObservabilityPath('overview', params),
    { cache: 'no-store' }
  );
}

export async function getObservabilityDeployments(
  params?: GetObservabilityParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ObservabilityPaginatedResult<ObservabilityDeployment>>(
    getObservabilityPath('deployments', params),
    { cache: 'no-store' }
  );
}

export async function getObservabilityLogs(
  params?: GetObservabilityParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ObservabilityLogsResult>(
    getObservabilityPath('logs', params),
    { cache: 'no-store' }
  );
}

export async function getObservabilityRequests(
  params?: GetObservabilityParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ObservabilityPaginatedResult<ObservabilityRequest>>(
    getObservabilityPath('requests', params),
    { cache: 'no-store' }
  );
}

export async function getObservabilityAnalytics(
  params?: Pick<GetObservabilityParams, 'projectId' | 'timeframeHours'>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ObservabilityAnalytics>(
    getObservabilityPath('analytics', params),
    { cache: 'no-store' }
  );
}

export async function getObservabilityCronRuns(
  params?: GetObservabilityParams,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ObservabilityPaginatedResult<ObservabilityCronRun>>(
    getObservabilityPath('cron-runs', params),
    { cache: 'no-store' }
  );
}

export async function getObservabilityResources(
  params?: Pick<GetObservabilityParams, 'projectId' | 'timeframeHours'>,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<ObservabilityResources>(
    getObservabilityPath('resources', params),
    { cache: 'no-store' }
  );
}

export async function getInfrastructureProjects(
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InfrastructureProjectsResponse>(
    '/api/v1/infrastructure/projects',
    { cache: 'no-store' }
  );
}

export async function createInfrastructureProject(
  payload: CreateInfrastructureProjectPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InfrastructureProjectResponse>(
    '/api/v1/infrastructure/projects',
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

export async function updateInfrastructureProject(
  projectId: string,
  payload: UpdateInfrastructureProjectPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InfrastructureProjectResponse>(
    `/api/v1/infrastructure/projects/${encodeURIComponent(projectId)}`,
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
    }
  );
}

export async function deleteInfrastructureProject(
  projectId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InfrastructureProjectResponse>(
    `/api/v1/infrastructure/projects/${encodeURIComponent(projectId)}`,
    {
      cache: 'no-store',
      method: 'DELETE',
    }
  );
}

export async function syncInfrastructureProject(
  projectId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InfrastructureProjectResponse>(
    `/api/v1/infrastructure/projects/${encodeURIComponent(projectId)}/sync`,
    {
      cache: 'no-store',
      method: 'POST',
    }
  );
}

export async function queueInfrastructureProjectDeploy(
  projectId: string,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<InfrastructureProjectResponse>(
    `/api/v1/infrastructure/projects/${encodeURIComponent(projectId)}/deploy`,
    {
      cache: 'no-store',
      method: 'POST',
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

export async function requestBlueGreenDeploymentRevert(
  payload: RequestBlueGreenDeploymentRevertPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RequestBlueGreenDeploymentRevertResponse>(
    '/api/v1/infrastructure/monitoring/blue-green/deployment-revert',
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

export async function requestBlueGreenWatcherRecovery(
  payload: RequestBlueGreenWatcherRecoveryPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<RequestBlueGreenWatcherRecoveryResponse>(
    '/api/v1/infrastructure/monitoring/blue-green/watcher-recovery',
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

export async function updateBlueGreenDockerRecoverySettings(
  payload: UpdateBlueGreenDockerRecoverySettingsPayload,
  options?: InternalApiClientOptions
) {
  const client = getInternalApiClient(options);
  return client.json<UpdateBlueGreenDockerRecoverySettingsResponse>(
    '/api/v1/infrastructure/monitoring/blue-green/recovery-settings',
    {
      body: JSON.stringify(payload),
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
      },
      method: 'PATCH',
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

export type * from './types';
