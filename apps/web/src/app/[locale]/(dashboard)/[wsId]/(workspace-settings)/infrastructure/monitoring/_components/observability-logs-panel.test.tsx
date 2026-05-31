/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { ObservabilityLogGroup } from '@tuturuuu/internal-api/infrastructure';
import { describe, expect, it, vi } from 'vitest';
import { ObservabilityLogsPanel } from './observability-logs-panel';

const messages: Record<string, string> = {
  all_levels: 'All levels',
  all_routes: 'All routes',
  all_sources: 'All sources',
  all_statuses: 'All statuses',
  'chips.deployment': 'Deployment {value}',
  'chips.level': 'Level {value}',
  'chips.query': 'Search {value}',
  'chips.request_id': 'Request {value}',
  'chips.route': 'Route {value}',
  'chips.source': 'Source {value}',
  'chips.status': 'Status {value}',
  clear_filters: 'Clear filters',
  collapse: 'Collapse log group',
  'columns.deployment': 'Deployment',
  'columns.level': 'Level',
  'columns.message': 'Message',
  'columns.request': 'Request',
  'columns.source': 'Source',
  'columns.status': 'Status',
  'columns.time': 'Time',
  deployment: 'Deployment stamp',
  description: 'Grouped logs',
  error_stack: 'Error stack',
  event_count: '{count} events',
  event_index: 'Event {index}',
  expand: 'Expand log group',
  first_event: 'First event',
  loaded: '{loaded}/{total} groups',
  metadata: 'Metadata',
  pause: 'Pause live',
  refresh: 'Refresh',
  request_id: 'Request ID',
  resume: 'Resume live',
  route: 'Route',
  search: 'Search messages, routes, requests',
  title: 'Grouped Log Stream',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    let value = messages[key] ?? key;
    for (const [paramKey, paramValue] of Object.entries(params ?? {})) {
      value = value.replace(`{${paramKey}}`, String(paramValue));
    }
    return value;
  },
}));

function createLogGroup(): ObservabilityLogGroup {
  const firstEvent = {
    createdAt: 1_000,
    deploymentColor: 'green',
    deploymentStamp: 'deploy-123',
    durationMs: 24,
    errorName: null,
    errorStack: null,
    id: 'event-1',
    ipAddress: '127.0.0.1',
    level: 'info' as const,
    message: 'Sampled infrastructure resources {',
    metadata: { jobId: 'infrastructure-sample-resources' },
    requestId: 'req-123',
    route: '/api/cron/infrastructure/sample-resources',
    source: 'api' as const,
    status: 200,
    userAgent: 'cron-runner',
  };
  const secondEvent = {
    ...firstEvent,
    createdAt: 2_000,
    errorName: 'Error',
    errorStack: 'Error: sampler failed',
    id: 'event-2',
    level: 'error' as const,
    message: 'activeBuilds: 0,',
    status: 500,
  };

  return {
    ...secondEvent,
    eventCount: 2,
    events: [firstEvent, secondEvent],
    firstEventAt: firstEvent.createdAt,
    id: 'request:req-123',
    message: firstEvent.message,
    route: firstEvent.route,
  };
}

describe('ObservabilityLogsPanel', () => {
  it('renders expandable grouped logs and forwards filter changes', () => {
    const onFilterChange = vi.fn();
    const onTogglePaused = vi.fn();

    render(
      <ObservabilityLogsPanel
        emptyLabel="No logs"
        endLabel="End"
        facets={{
          levels: [{ count: 2, errorCount: 1, value: 'error' }],
          routes: [
            {
              count: 2,
              errorCount: 1,
              value: '/api/cron/infrastructure/sample-resources',
            },
          ],
          sources: [{ count: 2, errorCount: 1, value: 'api' }],
          statuses: [{ count: 1, errorCount: 1, value: '5xx' }],
        }}
        filters={{
          deploymentStamp: '',
          level: 'all',
          query: '',
          requestId: '',
          route: 'all',
          source: 'all',
          status: 'all',
        }}
        groups={[createLogGroup()]}
        hasMore={false}
        isFetchingMore={false}
        isLoading={false}
        isPaused={false}
        loaded={1}
        loadingLabel="Loading"
        moreLabel="More"
        onFilterChange={onFilterChange}
        onLoadMore={() => {}}
        onRefresh={() => {}}
        onTogglePaused={onTogglePaused}
        total={1}
      />
    );

    expect(
      screen.getByText('Sampled infrastructure resources {')
    ).toBeInTheDocument();
    expect(screen.getByText('2 events')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Expand log group'));
    expect(screen.getAllByText('Metadata')).toHaveLength(2);
    expect(screen.getAllByText(/infrastructure-sample-resources/)).toHaveLength(
      2
    );
    expect(screen.getByText('Error stack')).toBeInTheDocument();

    fireEvent.change(
      screen.getByPlaceholderText('Search messages, routes, requests'),
      { target: { value: 'sample' } }
    );
    fireEvent.change(screen.getAllByRole('combobox')[0]!, {
      target: { value: '/api/cron/infrastructure/sample-resources' },
    });
    fireEvent.click(screen.getByText('Pause live'));

    expect(onFilterChange).toHaveBeenCalledWith({ query: 'sample' });
    expect(onFilterChange).toHaveBeenCalledWith({
      route: '/api/cron/infrastructure/sample-resources',
    });
    expect(onTogglePaused).toHaveBeenCalledTimes(1);
  });
});
