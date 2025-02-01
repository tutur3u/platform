import { MigrationModule } from '../modules';
import { Card } from '@repo/ui/components/ui/card';
import { Progress } from '@repo/ui/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  BarChart2,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';

type MigrationDataType =
  | {
      // eslint-disable-next-line no-unused-vars
      [key in MigrationModule]?: {
        externalData?: any[] | null;
        internalData?: any[] | null;
        externalTotal?: number | null;
        internalTotal?: number | null;
        loading?: boolean | null;
        error?: any | null;
      } | null;
    }
  | undefined;

interface ModuleStatsProps {
  migrationData: MigrationDataType;
}

export function ModuleStats({ migrationData }: ModuleStatsProps) {
  const stats = {
    total: Object.keys(migrationData ?? {}).length,
    loading: Object.values(migrationData ?? {}).filter((v) => v?.loading)
      .length,
    error: Object.values(migrationData ?? {}).filter((v) => v?.error).length,
    completed: Object.values(migrationData ?? {}).filter(
      (v) =>
        v?.externalData?.length &&
        v?.internalData?.length === v?.externalData?.length
    ).length,
    externalTotal: Object.values(migrationData ?? {}).reduce(
      (acc, v) => acc + (v?.externalTotal ?? 0),
      0
    ),
    externalLoaded: Object.values(migrationData ?? {}).reduce(
      (acc, v) => acc + (v?.externalData?.length ?? 0),
      0
    ),
    internalTotal: Object.values(migrationData ?? {}).reduce(
      (acc, v) => acc + (v?.internalTotal ?? 0),
      0
    ),
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card className="relative overflow-hidden p-6 transition-all hover:shadow-md">
        <div className="from-primary/5 to-primary/10 absolute inset-0 bg-gradient-to-br" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Modules</p>
              <p className="text-3xl font-bold tracking-tight">{stats.total}</p>
            </div>
            <div className="bg-primary/10 rounded-full p-3">
              <BarChart2 className="text-primary h-5 w-5" />
            </div>
          </div>
          <div className="mt-4">
            <Progress
              value={(stats.completed / stats.total) * 100}
              className="h-2"
            />
          </div>
          <div className="mt-4 flex items-center gap-4">
            {stats.loading > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm text-yellow-500">
                      {stats.loading}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {stats.loading} module(s) in progress
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {stats.error > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1.5">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm text-red-500">{stats.error}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {stats.error} module(s) failed
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {stats.completed > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-green-500">
                      {stats.completed}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {stats.completed} module(s) completed
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </Card>

      <Card className="relative overflow-hidden p-6 transition-all hover:shadow-md">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-blue-500/10" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">External Data</p>
              <div className="flex items-center gap-2">
                <p className="text-3xl font-bold tracking-tight">
                  {stats.externalTotal}
                </p>
                <ArrowRight className="h-4 w-4 text-blue-500" />
                <p className="text-xl font-semibold text-blue-500">
                  {stats.externalLoaded}
                </p>
              </div>
            </div>
            <div className="rounded-full bg-blue-500/10 p-3">
              <ArrowDownToLine className="h-5 w-5 text-blue-500" />
            </div>
          </div>
          <Progress
            value={(stats.externalLoaded / stats.externalTotal) * 100}
            className="mt-4 h-2"
          />
        </div>
      </Card>

      <Card className="relative overflow-hidden p-6 transition-all hover:shadow-md">
        <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-green-500/10" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Internal Data</p>
              <p className="text-3xl font-bold tracking-tight">
                {stats.internalTotal}
              </p>
            </div>
            <div className="rounded-full bg-green-500/10 p-3">
              <ArrowUpFromLine className="h-5 w-5 text-green-500" />
            </div>
          </div>
          <Progress
            value={(stats.internalTotal / stats.externalTotal) * 100}
            className="mt-4 h-2"
          />
        </div>
      </Card>

      <Card className="relative overflow-hidden p-6 transition-all hover:shadow-md">
        <div className="from-primary/5 to-primary/10 absolute inset-0 bg-gradient-to-br" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Overall Progress</p>
              <p className="text-3xl font-bold tracking-tight">
                {Math.round(
                  (stats.internalTotal / (stats.externalTotal || 1)) * 100
                )}
                %
              </p>
            </div>
            <div className="flex gap-2">
              {stats.loading > 0 && (
                <Clock className="h-5 w-5 animate-spin text-yellow-500" />
              )}
              {stats.error > 0 && <XCircle className="h-5 w-5 text-red-500" />}
              {stats.completed === stats.total && (
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              )}
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-2">
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <div className="text-xs font-medium">Pending</div>
              <div className="mt-1 text-lg font-semibold">
                {stats.total - stats.completed}
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <div className="text-xs font-medium">In Progress</div>
              <div className="mt-1 text-lg font-semibold">{stats.loading}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-2 text-center">
              <div className="text-xs font-medium">Completed</div>
              <div className="mt-1 text-lg font-semibold">
                {stats.completed}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
