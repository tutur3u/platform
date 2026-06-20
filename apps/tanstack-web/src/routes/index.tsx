import { queryOptions, useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import {
  readTanStackMigrationStatus,
  type TanStackMigrationStatus,
} from '../lib/migration-status';

const getMigrationStatus = createServerFn({ method: 'GET' }).handler(() =>
  readTanStackMigrationStatus()
);

const migrationStatusQuery = queryOptions({
  queryFn: () => getMigrationStatus(),
  queryKey: ['tanstack-migration-status'],
});

export const Route = createFileRoute('/')({
  component: MigrationDashboard,
  loader: async ({ context }) =>
    context.queryClient.ensureQueryData(migrationStatusQuery),
});

function MigrationDashboard() {
  const initialStatus = Route.useLoaderData();
  const statusQuery = useQuery({
    ...migrationStatusQuery,
    initialData: initialStatus,
  });
  const status = statusQuery.data;
  const coverage = status.cutoverGates.summary;
  const progress = status.migrationProgress.progress;
  const statusKind = status.backendReachable ? 'ready' : 'blocked';
  const cutoverStatus = status.cutoverGates.ok ? 'Cutover ready' : 'Blocked';

  return (
    <main className="migration-shell">
      <section className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-8 px-6 py-10 md:px-10">
        <header className="flex flex-col gap-5 border-border border-b pb-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-3xl space-y-3">
            <p className="font-medium text-muted-foreground text-sm">
              Tuturuuu platform migration
            </p>
            <h1 className="font-semibold text-3xl tracking-normal md:text-5xl">
              TanStack Start + Rust readiness
            </h1>
            <p className="max-w-2xl text-muted-foreground">
              Current Next.js ownership remains visible while new routes move to
              TanStack Start and a Rust backend behind parity, Docker, E2E, and
              benchmark gates.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-md border border-border bg-background px-4 py-3">
            <span
              aria-hidden
              className="migration-status-dot size-2.5 rounded-full"
              data-status={statusKind}
            />
            <span className="font-medium text-sm">
              {status.backendReachable
                ? 'Backend reachable'
                : 'Backend offline'}
            </span>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard label="Pages" value={coverage.pages} />
          <StatCard label="Layouts" value={coverage.layouts} />
          <StatCard label="API handlers" value={coverage.apiRoutes} />
          <StatCard label="Cron handlers" value={coverage.cronRoutes} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="migration-stat-card rounded-lg border p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold text-xl">Ownership progress</h2>
                <p className="mt-1 text-muted-foreground text-sm">
                  {progress.totals.remaining} route artifacts remain across
                  TanStack Start and Rust ownership.
                </p>
              </div>
              <span className="font-semibold text-2xl tabular-nums">
                {progress.totals.percentComplete}%
              </span>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {progress.byOwner.map((owner) => (
                <ProgressBucket bucket={owner} key={owner.key} />
              ))}
            </div>
          </div>

          <div className="migration-stat-card rounded-lg border p-5">
            <h2 className="font-semibold text-xl">Next route blockers</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              First remaining legacy artifacts from the checked manifest.
            </p>
            <div className="mt-5 grid gap-2">
              {progress.topLegacyRoutes.slice(0, 5).map((route) => (
                <RouteBlocker route={route} key={route.sourceFile} />
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="migration-stat-card rounded-lg border p-5">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-xl">Backend contract</h2>
                <p className="text-muted-foreground text-sm">
                  Rust service status returned through a TanStack Start server
                  function and TanStack Query, with a Cloudflare Workers
                  deployment target prepared.
                </p>
              </div>
              <span className="rounded-md border border-border px-3 py-1 font-medium text-sm">
                {status.backend.toolchain}
              </span>
            </div>
            <dl className="grid gap-3 text-sm md:grid-cols-2">
              <InfoTerm label="Service" value={status.backend.service} />
              <InfoTerm label="Runtime" value={status.backend.runtime} />
              <InfoTerm
                label="Target"
                value={status.backend.deploymentTarget}
              />
              <InfoTerm label="Environment" value={status.environment} />
              <InfoTerm
                label="Route manifest"
                value={status.routeOwnership.manifest}
              />
              <InfoTerm
                label="Ownership phase"
                value={status.routeOwnership.status}
              />
            </dl>
            {status.errorMessage ? (
              <p className="mt-5 rounded-md border border-border bg-muted p-3 text-muted-foreground text-sm">
                {status.errorMessage}
              </p>
            ) : null}
          </div>

          <div className="migration-stat-card rounded-lg border p-5">
            <h2 className="font-semibold text-xl">Cutover gates</h2>
            <p className="mt-1 text-muted-foreground text-sm">
              {cutoverStatus} - {status.cutoverGates.counts.legacyNext} legacy
              artifacts remaining
            </p>
            <div className="mt-5 space-y-3">
              {status.cutoverGates.gates.map((gate) => (
                <GateRow gate={gate} key={gate.id} />
              ))}
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}

function ProgressBucket({
  bucket,
}: {
  bucket: TanStackMigrationStatus['migrationProgress']['progress']['byOwner'][number];
}) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-sm">{bucket.label}</span>
        <span className="text-muted-foreground text-xs">
          {bucket.percentComplete}%
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-foreground"
          style={{ width: `${bucket.percentComplete}%` }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Remaining</span>
        <span className="font-medium tabular-nums">{bucket.remaining}</span>
      </div>
    </div>
  );
}

function RouteBlocker({
  route,
}: {
  route: TanStackMigrationStatus['migrationProgress']['progress']['topLegacyRoutes'][number];
}) {
  const methods = route.methods.length > 0 ? route.methods.join(', ') : 'none';

  return (
    <div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{route.routePath}</span>
        <span className="text-right text-muted-foreground text-xs">
          {route.targetOwner} / {methods}
        </span>
      </div>
      <p className="mt-1 break-all text-muted-foreground text-xs">
        {route.kind} - {route.sourceFile}
      </p>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="migration-stat-card rounded-lg border p-5">
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className="mt-2 font-semibold text-3xl tabular-nums">{value}</div>
    </div>
  );
}

function InfoTerm({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value}</dd>
    </div>
  );
}

function GateRow({
  gate,
}: {
  gate: TanStackMigrationStatus['cutoverGates']['gates'][number];
}) {
  return (
    <div className="grid gap-1 rounded-md border border-border bg-background px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground">{gate.label}</span>
        <span className="font-medium">{gate.ok ? 'Pass' : gate.status}</span>
      </div>
      <p className="text-muted-foreground text-xs">{gate.detail}</p>
    </div>
  );
}
