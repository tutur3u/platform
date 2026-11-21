import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { authorizeInfrastructureAdminRequest } from '@/lib/infrastructure-admin-access';
import {
  healthWindow,
  loadDeployMarkers,
  loadLatestRuns,
  loadProductAnalytics,
  loadServiceSeriesRows,
  loadServiceSummaryRows,
} from '@/lib/observability-health/load';
import {
  parseRange,
  parseService,
  serviceSeries,
  summarizeServices,
} from '@/lib/observability-health/summary';
import { HealthDrilldown } from './health-drilldown';
import { HealthOverview } from './health-overview';
import {
  analyticsApp,
  HealthProductAnalytics,
} from './health-product-analytics';

export default async function InfrastructureMonitoringHealthPage({
  params,
  searchParams,
}: {
  params: Promise<{ wsId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const access = await authorizeInfrastructureAdminRequest(
    'view_infrastructure'
  );
  if (!access.ok) notFound();

  const [{ wsId }, query] = await Promise.all([params, searchParams]);
  const range = parseRange(query.range);
  const service = parseService(query.service);
  const now = Date.now();
  const window = healthWindow(now, range);
  const db = access.sbAdmin;

  const [summaryRows, markers, runs, analytics, seriesRows] = await Promise.all(
    [
      loadServiceSummaryRows(db, window),
      loadDeployMarkers(db, window),
      loadLatestRuns(db),
      loadProductAnalytics(db, new Date(now).toISOString().slice(0, 10)),
      service
        ? loadServiceSeriesRows(db, window, range, service)
        : Promise.resolve(null),
    ]
  );

  const markerList = markers.status === 'ok' ? markers.data : [];
  const markersAvailable = markers.status === 'ok';
  const summaries =
    summaryRows.status === 'ok'
      ? summarizeServices(summaryRows.data, markerList, window)
      : null;
  const selected = service
    ? summaries?.find((entry) => entry.service === service)
    : undefined;

  return (
    <div className="space-y-6">
      <HealthOverview
        baseHref={`/${wsId}/monitoring/health`}
        markersAvailable={markersAvailable}
        range={range}
        runs={runs.status === 'ok' ? runs.data : null}
        selected={service}
        summaries={summaries}
      />
      {service && seriesRows ? (
        <HealthDrilldown
          markersAvailable={markersAvailable}
          markers={markerList.filter(
            (marker) =>
              Date.parse(marker.deployed_at) >= window.since &&
              Date.parse(marker.deployed_at) < window.until
          )}
          range={range}
          series={
            seriesRows.status === 'ok'
              ? serviceSeries(seriesRows.data, service, window)
              : null
          }
          service={service}
          summary={selected ?? null}
        />
      ) : null}
      <HealthProductAnalytics
        app={service ? analyticsApp(service) : null}
        cells={analytics.status === 'ok' ? analytics.data : null}
      />
    </div>
  );
}
