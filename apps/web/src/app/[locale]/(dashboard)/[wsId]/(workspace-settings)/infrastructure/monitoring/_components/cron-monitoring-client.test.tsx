/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type {
  CronExecutionRecord,
  CronMonitoringSnapshot,
} from '@tuturuuu/internal-api/infrastructure/monitoring';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CronMonitoringClient } from './cron-monitoring-client';

const mocks = vi.hoisted(() => ({
  archive: {
    data: {
      items: [] as CronExecutionRecord[],
      page: 1,
      pageSize: 12,
      total: 0,
    },
    error: null,
    isPending: false,
  },
  queueCronRun: vi.fn(),
  refetchSnapshot: vi.fn(),
  snapshot: {
    data: null as CronMonitoringSnapshot | null,
    error: null as Error | null,
    isPending: false,
    refetch: vi.fn(),
  },
  updateCronMonitoringControl: vi.fn(),
}));

vi.mock(
  '@tuturuuu/internal-api/infrastructure/monitoring',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('@tuturuuu/internal-api/infrastructure/monitoring')
      >();

    return {
      ...actual,
      queueCronRun: mocks.queueCronRun,
      updateCronMonitoringControl: mocks.updateCronMonitoringControl,
    };
  }
);

vi.mock('./blue-green-monitoring-query-hooks', () => ({
  useCronMonitoringExecutionArchive: () => mocks.archive,
  useCronMonitoringSnapshot: () => mocks.snapshot,
}));

const messages: Record<string, string> = {
  'actions.retry': 'Retry',
  'alerts.failed_description':
    'Monitoring data could not be loaded. Try again.',
  'alerts.failed_title': 'Unable to load monitoring data',
  'cron.actions.logs': 'View logs',
  'cron.actions.queueing': 'Queueing',
  'cron.actions.run_now': 'Run now',
  'cron.control.disabled_hint': 'Scheduled jobs are paused.',
  'cron.control.enabled_hint': 'Scheduled jobs can run.',
  'cron.description':
    'Track Docker cron execution, schedule health, and retained logs.',
  'cron.detail.console_logs': 'Console logs',
  'cron.detail.duration': 'Duration',
  'cron.detail.empty_console_logs': 'No console logs captured.',
  'cron.detail.empty_response': 'No response body captured.',
  'cron.detail.http_status': 'HTTP status',
  'cron.detail.response': 'Response',
  'cron.detail.started': 'Started',
  'cron.detail.status': 'Status',
  'cron.empty_executions': 'No executions retained yet.',
  'cron.empty_jobs': 'No cron jobs are registered.',
  'cron.execution_status.failed': 'Failed',
  'cron.execution_status.skipped': 'Skipped',
  'cron.execution_status.success': 'Success',
  'cron.execution_status.timeout': 'Timed out',
  'cron.executions_description':
    'Recent route responses and captured web container logs.',
  'cron.executions_title': 'Recent executions',
  'cron.failure_streak': '{count} failed in a row',
  'cron.jobs_count': '{enabled} of {total} enabled',
  'cron.jobs_description': 'Registered jobs from the shared cron config.',
  'cron.jobs_title': 'Registered jobs',
  'cron.last_run': 'Last run',
  'cron.next_run': 'Next run',
  'cron.runner_status.live': 'Live',
  'cron.runner_status.idle': 'Idle',
  'cron.runner_status.stale': 'Stale',
  'cron.runner_status.disabled': 'Disabled',
  'cron.runner_status.missing': 'Missing',
  'cron.run_status.done': 'Done',
  'cron.run_status.errored': 'Errored',
  'cron.run_status.processing': 'Processing',
  'cron.run_status.queued': 'Queued',
  'cron.run_status.skipped': 'Skipped',
  'cron.states.disabled': 'Disabled',
  'cron.states.enabled': 'Enabled',
  'cron.states.pending': 'Pending',
  'cron.stats.active_runs': 'Active runs',
  'cron.stats.active_runs_meta': '{queued} queued, {processing} processing',
  'cron.stats.executions': 'Executions',
  'cron.stats.failed_jobs': 'Failed jobs',
  'cron.stats.failed_jobs_meta': 'Jobs with failures',
  'cron.stats.next_run': 'Next run',
  'cron.stats.retained_meta': 'Retained locally',
  'cron.stats.runner': 'Runner',
  'cron.stats.runner_meta': 'Docker service state',
  'cron.title': 'Cron Jobs',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    const template = messages[key] ?? key;

    return Object.entries(values ?? {}).reduce(
      (value, [name, replacement]) => value.replace(`{${name}}`, replacement),
      template
    );
  },
}));

function createExecution(
  overrides: Partial<CronExecutionRecord> = {}
): CronExecutionRecord {
  return {
    consoleLogs: [],
    description: 'Sync payment product metadata.',
    durationMs: 1200,
    endedAt: 1_700_000_001_200,
    error: null,
    httpStatus: 200,
    id: 'exec-payment-products-1700000000000',
    jobId: 'payment-products',
    path: '/api/cron/payment/products',
    response: '{"ok":true}',
    schedule: '0 */12 * * *',
    scheduledAt: 1_700_000_000_000,
    source: 'scheduled',
    startedAt: 1_700_000_000_000,
    status: 'success',
    triggerId: null,
    ...overrides,
  };
}

function createSnapshot(
  overrides: Partial<CronMonitoringSnapshot> = {}
): CronMonitoringSnapshot {
  const execution = createExecution();

  return {
    control: {
      enabled: true,
      jobs: {},
      updatedAt: null,
      updatedBy: null,
      updatedByEmail: null,
    },
    enabled: true,
    jobs: [
      {
        configuredEnabled: true,
        controlEnabled: null,
        description: 'Sync payment product metadata.',
        enabled: true,
        failureStreak: 0,
        id: 'payment-products',
        lastExecution: execution,
        lastScheduledAt: 1_700_000_000_000,
        nextRunAt: 1_700_010_000_000,
        path: '/api/cron/payment/products',
        schedule: '0 */12 * * *',
      },
    ],
    lastExecution: execution,
    nextRunAt: 1_700_010_000_000,
    overview: {
      enabledJobs: 1,
      failedExecutions: 0,
      failedJobs: 0,
      processingRuns: 0,
      queuedRuns: 0,
      retainedExecutions: 1,
      totalJobs: 1,
    },
    retainedExecutionCount: 1,
    runnerRecoveryRequest: null,
    runs: [],
    source: {
      configAvailable: true,
      controlAvailable: true,
      runtimeDirAvailable: true,
      statusAvailable: true,
    },
    status: 'live',
    updatedAt: 1_700_000_002_000,
    ...overrides,
  };
}

function renderCronMonitoringClient() {
  const queryClient = new QueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <CronMonitoringClient />
    </QueryClientProvider>
  );
}

describe('CronMonitoringClient', () => {
  beforeEach(() => {
    mocks.snapshot = {
      data: createSnapshot(),
      error: null,
      isPending: false,
      refetch: mocks.refetchSnapshot,
    };
    mocks.archive = {
      data: {
        items: [createExecution()],
        page: 1,
        pageSize: 12,
        total: 1,
      },
      error: null,
      isPending: false,
    };
    mocks.queueCronRun.mockReset();
    mocks.updateCronMonitoringControl.mockReset();
    mocks.refetchSnapshot.mockReset();
  });

  it('renders a loading skeleton while the snapshot is pending', () => {
    mocks.snapshot = {
      data: null,
      error: null,
      isPending: true,
      refetch: mocks.refetchSnapshot,
    };

    const { container } = renderCronMonitoringClient();

    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(5);
  });

  it('renders an inline error state when the snapshot fails', () => {
    mocks.snapshot = {
      data: null,
      error: new Error('failed'),
      isPending: false,
      refetch: mocks.refetchSnapshot,
    };

    renderCronMonitoringClient();

    expect(screen.getByText('Unable to load monitoring data')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });

  it('renders empty job and execution states', () => {
    mocks.snapshot = {
      data: createSnapshot({
        jobs: [],
        overview: {
          enabledJobs: 0,
          failedExecutions: 0,
          failedJobs: 0,
          processingRuns: 0,
          queuedRuns: 0,
          retainedExecutions: 0,
          totalJobs: 0,
        },
      }),
      error: null,
      isPending: false,
      refetch: mocks.refetchSnapshot,
    };
    mocks.archive = {
      data: {
        items: [],
        page: 1,
        pageSize: 12,
        total: 0,
      },
      error: null,
      isPending: false,
    };

    renderCronMonitoringClient();

    expect(screen.getByText('No cron jobs are registered.')).toBeVisible();
    expect(screen.getByText('No executions retained yet.')).toBeVisible();
  });

  it('renders populated job and execution state', () => {
    renderCronMonitoringClient();

    expect(screen.getByRole('heading', { name: 'Cron Jobs' })).toBeVisible();
    expect(screen.getAllByText('payment-products')).toHaveLength(2);
    expect(screen.getAllByText('/api/cron/payment/products')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Run now/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /View logs/ })).toBeVisible();
  });

  it('renders queued and processing run state from the live snapshot', () => {
    mocks.snapshot = {
      data: createSnapshot({
        overview: {
          enabledJobs: 1,
          failedExecutions: 0,
          failedJobs: 0,
          processingRuns: 1,
          queuedRuns: 0,
          retainedExecutions: 1,
          totalJobs: 1,
        },
        runs: [
          {
            consoleLogs: [
              {
                containerId: 'web-blue-1',
                deploymentColor: 'blue',
                level: 'info',
                message: 'Syncing calendar provider data',
                source: 'route',
                time: 1_700_000_001_000,
              },
            ],
            description: 'Sync payment product metadata.',
            durationMs: 1000,
            endedAt: null,
            error: null,
            executionId: null,
            httpStatus: null,
            id: 'request-1',
            jobId: 'payment-products',
            path: '/api/cron/payment/products',
            requestedAt: 1_700_000_000_500,
            requestedBy: 'user-1',
            requestedByEmail: 'ops@tuturuuu.com',
            response: null,
            schedule: '0 */12 * * *',
            source: 'manual',
            startedAt: 1_700_000_001_000,
            status: 'processing',
            updatedAt: 1_700_000_002_000,
          },
        ],
      }),
      error: null,
      isPending: false,
      refetch: mocks.refetchSnapshot,
    };

    renderCronMonitoringClient();

    expect(screen.getAllByText('Processing').length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByRole('button', { name: /Processing/ })
        .some((button) => button.hasAttribute('disabled'))
    ).toBe(true);
  });
});
