'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Clock,
  Loader2,
  RefreshCw,
  Trash2,
  TriangleAlert,
  UserPlus,
  XCircle,
  Zap,
} from '@tuturuuu/icons';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { Progress } from '@tuturuuu/ui/progress';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MigrationState {
  status: 'idle' | 'loading' | 'running' | 'success' | 'warning' | 'error';
  current: number;
  total: number;
  stats: Record<string, number>;
  errorDetails?: Array<{ id: string; error: string }>;
  message?: string;
  duration?: number;
}

const INITIAL_STATE: MigrationState = {
  status: 'idle',
  current: 0,
  total: 0,
  stats: {},
};

// ---------------------------------------------------------------------------
// Stream reader
// ---------------------------------------------------------------------------

async function readMigrationStream(
  res: Response,
  onEvent: (event: Record<string, unknown>) => void
) {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        onEvent(JSON.parse(line));
      }
    }
  }

  // Flush remaining buffer
  if (buffer.trim()) {
    onEvent(JSON.parse(buffer));
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${seconds}s`;
}

function getStatusBadge(status: MigrationState['status']) {
  switch (status) {
    case 'idle':
      return null;
    case 'loading':
      return (
        <Badge variant="secondary">
          <Loader2 className="h-3 w-3 animate-spin" />
          Fetching data...
        </Badge>
      );
    case 'running':
      return (
        <Badge variant="secondary">
          <Loader2 className="h-3 w-3 animate-spin" />
          Processing...
        </Badge>
      );
    case 'success':
      return (
        <Badge variant="success">
          <CheckCircle2 className="h-3 w-3" />
          Completed
        </Badge>
      );
    case 'warning':
      return (
        <Badge variant="warning">
          <TriangleAlert className="h-3 w-3" />
          Completed with errors
        </Badge>
      );
    case 'error':
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3" />
          Failed
        </Badge>
      );
  }
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------

function StatItem({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: number | string;
  colorClass?: string;
}) {
  return (
    <div className="rounded-lg border bg-background p-3 text-center">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className={`font-bold text-xl tabular-nums ${colorClass ?? ''}`}>
        {value}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error Details
// ---------------------------------------------------------------------------

function ErrorDetailsList({
  errors,
}: {
  errors: Array<{ id: string; error: string }>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="w-full justify-between">
          <span className="font-medium text-destructive text-sm">
            {errors.length} error{errors.length !== 1 ? 's' : ''} — click to{' '}
            {open ? 'hide' : 'view'}
          </span>
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {errors.map((err, idx) => (
            <div
              key={idx}
              className="rounded-md bg-destructive/5 px-3 py-2 text-xs"
            >
              <span className="font-mono text-muted-foreground">{err.id}</span>
              <span className="mx-1.5 text-muted-foreground">—</span>
              <span className="text-destructive">{err.error}</span>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Elapsed Time Hook
// ---------------------------------------------------------------------------

function useElapsedTime(isRunning: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isRunning) {
      startRef.current = null;
      return;
    }

    startRef.current = Date.now();
    const interval = setInterval(() => {
      if (startRef.current) setElapsed(Date.now() - startRef.current);
    }, 250);

    return () => clearInterval(interval);
  }, [isRunning]);

  return elapsed;
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function PlatformSubscriptionsMigrationPage() {
  const [revokeState, setRevokeState] = useState<MigrationState>(INITIAL_STATE);
  const [freeState, setFreeState] = useState<MigrationState>(INITIAL_STATE);
  const [orphanState, setOrphanState] = useState<MigrationState>(INITIAL_STATE);
  const [crossCheckP1State, setCrossCheckP1State] =
    useState<MigrationState>(INITIAL_STATE);
  const [crossCheckP2State, setCrossCheckP2State] =
    useState<MigrationState>(INITIAL_STATE);
  const [crossCheckP3State, setCrossCheckP3State] =
    useState<MigrationState>(INITIAL_STATE);
  const [phase1AffectedWsIds, setPhase1AffectedWsIds] = useState<string[]>([]);

  const revokeRunning =
    revokeState.status === 'running' || revokeState.status === 'loading';
  const freeRunning =
    freeState.status === 'running' || freeState.status === 'loading';
  const orphanRunning =
    orphanState.status === 'running' || orphanState.status === 'loading';
  const crossCheckP1Running =
    crossCheckP1State.status === 'running' ||
    crossCheckP1State.status === 'loading';
  const crossCheckP2Running =
    crossCheckP2State.status === 'running' ||
    crossCheckP2State.status === 'loading';
  const crossCheckP3Running =
    crossCheckP3State.status === 'running' ||
    crossCheckP3State.status === 'loading';
  const anyRunning =
    revokeRunning ||
    freeRunning ||
    orphanRunning ||
    crossCheckP1Running ||
    crossCheckP2Running ||
    crossCheckP3Running;

  const revokeElapsed = useElapsedTime(revokeRunning);
  const freeElapsed = useElapsedTime(freeRunning);
  const orphanElapsed = useElapsedTime(orphanRunning);
  const crossCheckP1Elapsed = useElapsedTime(crossCheckP1Running);
  const crossCheckP2Elapsed = useElapsedTime(crossCheckP2Running);
  const crossCheckP3Elapsed = useElapsedTime(crossCheckP3Running);

  const runMigration = useCallback(
    async (
      route: string,
      method: 'DELETE' | 'POST',
      setState: React.Dispatch<React.SetStateAction<MigrationState>>,
      options?: {
        body?: unknown;
        onComplete?: (event: Record<string, unknown>) => void;
      }
    ) => {
      setState({ ...INITIAL_STATE, status: 'loading' });

      try {
        const res = await fetch(route, {
          method,
          ...(options?.body
            ? {
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(options.body),
              }
            : {}),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Request failed');
        }

        await readMigrationStream(res, (event) => {
          // Extract all numeric stat keys from event (excluding meta fields)
          const extractStats = (e: Record<string, unknown>) => {
            const metaKeys = new Set([
              'type',
              'current',
              'total',
              'errorDetails',
              'message',
              'duration',
              'error',
              'phase',
              'affectedWsIds',
            ]);
            const stats: Record<string, number> = {};
            for (const [k, v] of Object.entries(e)) {
              if (!metaKeys.has(k) && typeof v === 'number') {
                stats[k] = v;
              }
            }
            return stats;
          };

          switch (event.type) {
            case 'start':
              setState((prev) => ({
                ...prev,
                status: 'running',
                total: event.total as number,
              }));
              break;
            case 'progress':
              setState((prev) => ({
                ...prev,
                current: event.current as number,
                total: event.total as number,
                stats: extractStats(event),
              }));
              break;
            case 'complete':
              setState((prev) => ({
                ...prev,
                status: (event.errors as number) > 0 ? 'warning' : 'success',
                current: event.total as number,
                stats: extractStats(event),
                errorDetails: event.errorDetails as
                  | Array<{ id: string; error: string }>
                  | undefined,
                message: event.message as string,
                duration: event.duration as number,
              }));
              options?.onComplete?.(event);
              break;
            case 'error':
              setState((prev) => ({
                ...prev,
                status: 'error',
                message: event.error as string,
              }));
              break;
          }
        });

        setState((prev) => {
          if (prev.status === 'success') {
            toast.success('Migration completed successfully', {
              description: prev.message,
            });
          } else if (prev.status === 'warning') {
            toast.warning('Migration completed with errors', {
              description: prev.message,
            });
          }
          return prev;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setState((prev) => ({ ...prev, status: 'error', message }));
        toast.error('Migration failed', { description: message });
      }
    },
    []
  );

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="mb-2 font-bold text-3xl">Platform Billing</h1>
        <p className="text-muted-foreground">
          Global migration tool for admin use only
        </p>
      </div>

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Admin-Only Feature</AlertTitle>
        <AlertDescription>
          These actions affect ALL workspaces and subscriptions across the
          entire platform. Use with extreme caution.
        </AlertDescription>
      </Alert>

      {/* Revoke Duplicate Subscriptions */}
      <MigrationCard
        icon={<Zap className="h-5 w-5" />}
        title="Revoke Duplicate Subscriptions"
        description={[
          'Find workspaces with more than one active subscription',
          'Keep the latest subscription per workspace (sorted by creation date)',
          'Revoke older duplicate subscriptions in Polar',
          'Skip workspaces that only have a single active subscription',
        ]}
        state={revokeState}
        elapsed={revokeElapsed}
        statLabels={['Revoked', 'Kept', 'Skipped', 'Errors']}
        statKeys={['processed', 'kept', 'skipped', 'errors']}
        disabled={anyRunning}
        variant="destructive"
        confirmLabel="This will revoke old duplicate subscriptions (keeping the latest per workspace). Are you sure?"
        actionLabel="Revoke Duplicate Subscriptions"
        pendingLabel="Revoking..."
        actionIcon={<Zap className="mr-2 h-4 w-4" />}
        onRun={() =>
          runMigration(
            '/api/payment/migrations/subscriptions/duplicates',
            'DELETE',
            setRevokeState
          )
        }
      />

      {/* Step 2: Add Free Subscriptions */}
      <MigrationCard
        icon={<UserPlus className="h-5 w-5" />}
        title="Add Free Subscriptions"
        description={[
          'Find all workspaces without active subscriptions',
          'Subscribe workspaces to free product via Polar',
          'Skip workspaces that already have active subscriptions',
        ]}
        state={freeState}
        elapsed={freeElapsed}
        statLabels={['Created', 'Skipped', 'Errors']}
        statKeys={['created', 'skipped', 'errors']}
        disabled={anyRunning}
        variant="default"
        actionLabel="Add Free Subscriptions"
        pendingLabel="Creating..."
        actionIcon={<UserPlus className="mr-2 h-4 w-4" />}
        onRun={() =>
          runMigration(
            '/api/payment/migrations/subscriptions',
            'POST',
            setFreeState
          )
        }
      />

      {/* Revoke Orphaned Subscriptions */}
      <MigrationCard
        icon={<Trash2 className="h-5 w-5" />}
        title="Revoke Orphaned Subscriptions"
        description={[
          'Find active subscriptions for workspaces that no longer exist',
          'Covers both hard-deleted (removed rows) and soft-deleted (deleted = true) workspaces',
          'Revoke orphaned subscriptions in Polar',
          'Skip subscriptions belonging to valid workspaces',
        ]}
        state={orphanState}
        elapsed={orphanElapsed}
        statLabels={['Revoked', 'Skipped', 'Errors']}
        statKeys={['processed', 'skipped', 'errors']}
        disabled={anyRunning}
        variant="destructive"
        confirmLabel="This will revoke all active subscriptions for workspaces that no longer exist (hard-deleted or soft-deleted). Are you sure?"
        actionLabel="Revoke Orphaned Subscriptions"
        pendingLabel="Revoking..."
        actionIcon={<Trash2 className="mr-2 h-4 w-4" />}
        onRun={() =>
          runMigration(
            '/api/payment/migrations/subscriptions/unexisted-workspaces',
            'DELETE',
            setOrphanState
          )
        }
      />

      {/* Cross-Check Phase 1: DB → Polar */}
      <MigrationCard
        icon={<RefreshCw className="h-5 w-5" />}
        title="Cross-Check Phase 1: DB → Polar"
        description={[
          'Verify each active DB subscription against the Polar API',
          'Update DB status if Polar reports the subscription is no longer active',
          'Collect affected workspace IDs for Phase 3',
        ]}
        state={crossCheckP1State}
        elapsed={crossCheckP1Elapsed}
        statLabels={['Synced', 'Skipped', 'Errors']}
        statKeys={['synced', 'skipped', 'errors']}
        disabled={anyRunning}
        variant="default"
        actionLabel="Run Phase 1: DB → Polar"
        pendingLabel="Checking..."
        actionIcon={<RefreshCw className="mr-2 h-4 w-4" />}
        onRun={() =>
          runMigration(
            '/api/payment/migrations/subscriptions/cross-check/phase-1',
            'POST',
            setCrossCheckP1State,
            {
              onComplete: (event) => {
                const wsIds = (event.affectedWsIds as string[]) ?? [];
                setPhase1AffectedWsIds(wsIds);
              },
            }
          )
        }
      />

      {/* Cross-Check Phase 2: Polar → DB */}
      <MigrationCard
        icon={<RefreshCw className="h-5 w-5" />}
        title="Cross-Check Phase 2: Polar → DB"
        description={[
          'List all active Polar subscriptions',
          'Find subscriptions missing from the database',
          'Sync missing subscriptions to the database',
        ]}
        state={crossCheckP2State}
        elapsed={crossCheckP2Elapsed}
        statLabels={['Synced', 'Skipped', 'Errors']}
        statKeys={['polarSynced', 'skipped', 'errors']}
        disabled={anyRunning}
        variant="default"
        actionLabel="Run Phase 2: Polar → DB"
        pendingLabel="Syncing..."
        actionIcon={<RefreshCw className="mr-2 h-4 w-4" />}
        onRun={() =>
          runMigration(
            '/api/payment/migrations/subscriptions/cross-check/phase-2',
            'POST',
            setCrossCheckP2State
          )
        }
      />

      {/* Cross-Check Phase 3: Free Subscription Fallback */}
      <MigrationCard
        icon={<UserPlus className="h-5 w-5" />}
        title="Cross-Check Phase 3: Free Fallback"
        description={[
          `Create free subscriptions for workspaces that lost their active subscription in Phase 1 (${phase1AffectedWsIds.length} workspace(s) pending)`,
          'Requires Phase 1 to complete first',
          'Logs errors for workspaces where Polar rejects subscription creation',
        ]}
        state={crossCheckP3State}
        elapsed={crossCheckP3Elapsed}
        statLabels={['Created', 'Skipped', 'Errors']}
        statKeys={['freeCreated', 'skipped', 'errors']}
        disabled={anyRunning || phase1AffectedWsIds.length === 0}
        variant="default"
        actionLabel={`Run Phase 3: Free Fallback (${phase1AffectedWsIds.length})`}
        pendingLabel="Creating..."
        actionIcon={<UserPlus className="mr-2 h-4 w-4" />}
        onRun={() =>
          runMigration(
            '/api/payment/migrations/subscriptions/cross-check/phase-3',
            'POST',
            setCrossCheckP3State,
            { body: { wsIds: phase1AffectedWsIds } }
          )
        }
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Migration Card Component
// ---------------------------------------------------------------------------

function MigrationCard({
  icon,
  title,
  description,
  state,
  elapsed,
  statLabels,
  statKeys,
  disabled,
  variant,
  confirmLabel,
  actionLabel,
  pendingLabel,
  actionIcon,
  onRun,
}: {
  icon: React.ReactNode;
  title: string;
  description: string[];
  state: MigrationState;
  elapsed: number;
  statLabels: string[];
  statKeys: string[];
  disabled: boolean;
  variant: 'destructive' | 'default';
  confirmLabel?: string;
  actionLabel: string;
  pendingLabel: string;
  actionIcon: React.ReactNode;
  onRun: () => void;
}) {
  const isRunning = state.status === 'running' || state.status === 'loading';
  const isDone =
    state.status === 'success' ||
    state.status === 'warning' ||
    state.status === 'error';
  const percent =
    state.total > 0 ? Math.round((state.current / state.total) * 100) : 0;

  const actionButton = (
    <Button
      onClick={confirmLabel ? undefined : onRun}
      disabled={disabled}
      variant={variant}
      className="w-full"
    >
      {isRunning ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {pendingLabel}
        </>
      ) : (
        <>
          {actionIcon}
          {actionLabel}
        </>
      )}
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          {getStatusBadge(state.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Description */}
        <ul className="list-inside list-disc space-y-1 text-muted-foreground text-sm">
          {description.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        {/* Progress Section */}
        {(isRunning || isDone) && (
          <>
            <Separator />

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {state.current.toLocaleString()} /{' '}
                  {state.total.toLocaleString()}
                </span>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDuration(
                      isDone ? (state.duration ?? elapsed) : elapsed
                    )}
                  </span>
                  <span className="font-medium tabular-nums">{percent}%</span>
                </div>
              </div>
              <Progress
                value={percent}
                className="h-2.5"
                indicatorClassName={
                  state.status === 'error'
                    ? 'bg-destructive'
                    : state.status === 'warning'
                      ? 'bg-dynamic-yellow'
                      : state.status === 'success'
                        ? 'bg-dynamic-green'
                        : ''
                }
              />
            </div>

            {/* Stats grid */}
            <div
              className={`grid gap-2 ${
                statKeys.length >= 4 ? 'grid-cols-5' : 'grid-cols-4'
              }`}
            >
              <StatItem label="Total" value={state.total.toLocaleString()} />
              {statLabels.map((label, i) => {
                const key = statKeys[i]!;
                const value = state.stats[key] ?? 0;
                const colorClass =
                  key === 'errors' && value > 0
                    ? 'text-destructive'
                    : key === 'skipped' && value > 0
                      ? 'text-dynamic-yellow'
                      : ['kept', 'polarSynced', 'freeCreated'].includes(key) &&
                          value > 0
                        ? 'text-dynamic-blue'
                        : ['created', 'processed', 'synced'].includes(key) &&
                            value > 0
                          ? 'text-dynamic-green'
                          : '';
                return (
                  <StatItem
                    key={key}
                    label={label}
                    value={value.toLocaleString()}
                    colorClass={colorClass}
                  />
                );
              })}
            </div>

            {/* Error details */}
            {state.errorDetails && state.errorDetails.length > 0 && (
              <ErrorDetailsList errors={state.errorDetails} />
            )}

            {/* Summary message */}
            {isDone && state.message && (
              <p className="text-muted-foreground text-sm">{state.message}</p>
            )}
          </>
        )}

        {/* Action button */}
        {confirmLabel ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>{actionButton}</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>{confirmLabel}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onRun}>Continue</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          actionButton
        )}
      </CardContent>
    </Card>
  );
}
