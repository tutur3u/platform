import { ModulePackage } from '../modules';
import { logger } from '../utils/logging';
import { DataPreview } from './DataPreview';
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
} from '@repo/ui/components/ui/alert-dialog';
import { Button } from '@repo/ui/components/ui/button';
import { Card } from '@repo/ui/components/ui/card';
import { Progress } from '@repo/ui/components/ui/progress';
import { Separator } from '@repo/ui/components/ui/separator';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@repo/ui/components/ui/tooltip';
import { GitMerge, Info, Play, RefreshCcw } from 'lucide-react';
import { useState } from 'react';

interface ModuleCardProps {
  module: ModulePackage;
  onMigrate: (module: ModulePackage) => Promise<void>;
  externalCount: number;
  internalCount: number;
  isLoading: boolean;
  error?: any;
  externalData?: any[] | null;
  internalData?: any[] | null;
}

export function ModuleCard({
  module,
  onMigrate,
  externalCount,
  internalCount,
  isLoading,
  error,
  externalData,
  internalData,
}: ModuleCardProps) {
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleMigrate = async () => {
    try {
      await onMigrate(module);
    } catch (error) {
      logger.log('error', module.module, 'Migration failed', error);
    }
  };

  const getExternalProgress = () => {
    if (externalCount === 0) return 100;
    return ((externalCount || 0) / externalCount) * 100;
  };

  const getInternalProgress = () => {
    if (externalCount === 0) return 100;
    if (module.skip) return 100;
    return (internalCount / externalCount) * 100;
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="font-semibold">{module.name}</div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-4 w-4">
                  <Info className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>External Path: {module.externalPath}</p>
                {module.internalPath && (
                  <p>Internal Path: {module.internalPath}</p>
                )}
                {module.skip && <p>This module is skipped</p>}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <div className="flex gap-1">
          {externalCount > 0 && (
            <div className="flex items-center justify-center rounded border px-2 py-0.5 text-sm font-semibold">
              {externalCount}
            </div>
          )}

          {externalData && (
            <DataPreview module={module} data={externalData} type="external" />
          )}

          {internalData && (
            <DataPreview module={module} data={internalData} type="internal" />
          )}

          <AlertDialog
            open={showConfirmation}
            onOpenChange={setShowConfirmation}
          >
            <AlertDialogTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                disabled={module.disabled || isLoading}
              >
                <GitMerge className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirm Migration</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to migrate {module.name}? This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleMigrate}>
                  Continue
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button
            onClick={() => setShowConfirmation(true)}
            variant="secondary"
            size="icon"
            disabled={module.disabled || isLoading}
          >
            {externalCount > 0 ? (
              <RefreshCcw className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {!module.disabled && (
        <>
          <Separator className="my-2" />

          <div className="grid gap-2">
            <div className="grid gap-1">
              <div className="flex items-center justify-between">
                <span>External</span>
                <span className="text-muted-foreground text-sm">
                  {externalCount} items
                </span>
              </div>
              <Progress value={getExternalProgress()} />
            </div>

            <div className="grid gap-1">
              <div className="flex items-center justify-between">
                <span>Synchronized</span>
                <span className="text-muted-foreground text-sm">
                  {internalCount} / {externalCount} items
                </span>
              </div>
              <Progress value={getInternalProgress()} />
            </div>

            {error && (
              <div className="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-600">
                {error.message || 'An error occurred'}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
