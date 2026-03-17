'use client';

import { Settings } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useWorkspaceConfig } from '@tuturuuu/ui/hooks/use-workspace-config';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { z } from 'zod';

interface ThresholdSettingsDialogProps {
  wsId: string;
  currentThreshold?: number | null;
  onUpdate: () => void;
}

const thresholdSchema = z.coerce
  .number({ message: 'Please enter a valid number' })
  .int('Threshold must be a whole number')
  .min(0, 'Threshold must be 0 or greater');

export function ThresholdSettingsDialog({
  wsId,
  currentThreshold = null,
  onUpdate,
}: ThresholdSettingsDialogProps) {
  const t = useTranslations('time-tracker.requests.settings');
  const statusChangeGracePeriodConfigId =
    'TIME_TRACKING_REQUEST_STATUS_CHANGE_GRACE_PERIOD_MINUTES';
  const {
    data: statusChangeGracePeriodValue,
    isLoading: isGracePeriodLoading,
  } = useWorkspaceConfig<string>(wsId, statusChangeGracePeriodConfigId);
  const hasLoadedGracePeriod = statusChangeGracePeriodValue !== undefined;
  const initialGracePeriodValue = statusChangeGracePeriodValue ?? '0';
  const [open, setOpen] = useState(false);
  // noApprovalNeeded is true when threshold is null (default - no restrictions)
  const [noApprovalNeeded, setNoApprovalNeeded] = useState(
    currentThreshold === null
  );
  const [inputValue, setInputValue] = useState(
    currentThreshold === null ? '1' : String(currentThreshold)
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [gracePeriodInputValue, setGracePeriodInputValue] = useState(
    initialGracePeriodValue || '0'
  );
  const [isLoading, setIsLoading] = useState(false);

  // Always parse the input value to maintain clear typing
  const parsed = thresholdSchema.safeParse(inputValue);
  const parsedGracePeriod = thresholdSchema.safeParse(gracePeriodInputValue);

  // Check if values have changed from initial state
  const hasChanged =
    noApprovalNeeded !== (currentThreshold === null) ||
    (!noApprovalNeeded && parsed.success && parsed.data !== currentThreshold) ||
    (hasLoadedGracePeriod && parsedGracePeriod.success
      ? parsedGracePeriod.data !== Number.parseInt(initialGracePeriodValue, 10)
      : false);

  const isSubmitDisabled =
    isLoading ||
    !hasLoadedGracePeriod ||
    (!noApprovalNeeded && !parsed.success) ||
    !parsedGracePeriod.success ||
    !hasChanged;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!noApprovalNeeded && !parsed.success) {
      toast.error(parsed.error.message);
      return;
    }

    if (!parsedGracePeriod.success) {
      toast.error(parsedGracePeriod.error.message);
      return;
    }

    if (!hasLoadedGracePeriod) {
      toast.error(t('error'));
      return;
    }

    setIsLoading(true);
    setValidationError(null);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/threshold`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            threshold: noApprovalNeeded ? null : parsed.data,
            statusChangeGracePeriodMinutes: parsedGracePeriod.data,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update threshold');
      }

      toast.success(t('success'));
      setOpen(false);
      onUpdate();
    } catch (error) {
      console.error('Error updating threshold:', error);
      toast.error(error instanceof Error ? error.message : t('error'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => {
            setNoApprovalNeeded(currentThreshold === null);
            setInputValue(
              currentThreshold === null ? '1' : String(currentThreshold)
            );
            setGracePeriodInputValue(initialGracePeriodValue);
            setValidationError(null);
            setOpen(true);
          }}
        >
          <Settings className="h-4 w-4" />
          {t('button')}
        </Button>
      </DialogTrigger>
      <DialogContent
        className="sm:max-w-125"
        onPointerDownOutside={(e) => {
          if (hasChanged) {
            e.preventDefault();
          }
        }}
        onInteractOutside={(e) => {
          if (hasChanged) {
            e.preventDefault();
          }
        }}
        onEscapeKeyDown={(e) => {
          if (hasChanged) {
            e.preventDefault();
          }
        }}
      >
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="no-approval-needed"
                checked={noApprovalNeeded}
                onCheckedChange={(checked) => {
                  setNoApprovalNeeded(checked === true);
                  setValidationError(null);
                }}
              />
              <Label
                htmlFor="no-approval-needed"
                className="cursor-pointer font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {t('noApprovalNeeded')}
              </Label>
            </div>

            {noApprovalNeeded && (
              <div className="rounded-md bg-dynamic-green/10 p-3 text-sm">
                <p className="text-dynamic-green">{t('noApprovalHint')}</p>
              </div>
            )}

            {!noApprovalNeeded && (
              <div className="space-y-2">
                <Label htmlFor="threshold">{t('label')}</Label>
                <Input
                  id="threshold"
                  type="number"
                  min={0}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setValidationError(null);
                  }}
                  className="w-full"
                />
                {validationError && (
                  <p className="text-dynamic-red text-sm">{validationError}</p>
                )}
                <p className="text-muted-foreground text-sm">{t('help')}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="status-change-grace-period">
                {t('statusChangeGracePeriodLabel')}
              </Label>
              <Input
                id="status-change-grace-period"
                type="number"
                min={0}
                value={gracePeriodInputValue}
                onChange={(e) => {
                  setGracePeriodInputValue(e.target.value);
                  setValidationError(null);
                }}
                disabled={isGracePeriodLoading}
                className="w-full"
              />
              <p className="text-muted-foreground text-sm">
                {t('statusChangeGracePeriodHelp')}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={isLoading}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitDisabled}>
              {isLoading ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
