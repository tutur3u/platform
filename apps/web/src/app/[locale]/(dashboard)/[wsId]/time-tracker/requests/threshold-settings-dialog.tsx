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
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { z } from 'zod';

interface ThresholdSettingsDialogProps {
  wsId: string;
  currentThreshold?: number | null;
  currentPauseExempt?: boolean;
  currentResumeThreshold?: number | null;
  onUpdate: () => void;
}

const thresholdSchema = z.coerce
  .number({ message: 'Please enter a valid number' })
  .int('Threshold must be a whole number')
  .min(0, 'Threshold must be 0 or greater');

export function ThresholdSettingsDialog({
  wsId,
  currentThreshold = null,
  currentPauseExempt = false,
  currentResumeThreshold = 120,
  onUpdate,
}: ThresholdSettingsDialogProps) {
  const t = useTranslations('time-tracker.requests.settings');
  const [open, setOpen] = useState(false);
  // noApprovalNeeded is true when threshold is null (default - no restrictions)
  const [noApprovalNeeded, setNoApprovalNeeded] = useState(
    currentThreshold === null
  );
  const [inputValue, setInputValue] = useState(
    currentThreshold === null ? '1' : String(currentThreshold)
  );
  const [pauseExempt, setPauseExempt] = useState(currentPauseExempt);
  const [resumeThreshold, setResumeThreshold] = useState(
    currentResumeThreshold === null ? '' : String(currentResumeThreshold)
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Always parse the input value to maintain clear typing
  const parsed = thresholdSchema.safeParse(inputValue);
  const parsedResume = thresholdSchema.safeParse(resumeThreshold || 0);

  // Check if values have changed from initial state
  const hasChanged =
    noApprovalNeeded !== (currentThreshold === null) ||
    (!noApprovalNeeded && parsed.success && parsed.data !== currentThreshold) ||
    pauseExempt !== currentPauseExempt ||
    (resumeThreshold === '' && currentResumeThreshold !== null) ||
    (resumeThreshold !== '' &&
      parsedResume.success &&
      parsedResume.data !== currentResumeThreshold);

  const isSubmitDisabled =
    isLoading ||
    (!noApprovalNeeded && !parsed.success) ||
    (resumeThreshold !== '' && !parsedResume.success) ||
    !hasChanged;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoading(true);
    setValidationError(null);

    try {
      const resThreshold =
        resumeThreshold === '' ? null : parseInt(resumeThreshold);

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/threshold`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            threshold: noApprovalNeeded
              ? null
              : parsed.success
                ? parsed.data
                : null,
            pauseThresholdExempt: pauseExempt,
            resumeThresholdMinutes: resThreshold,
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
            setPauseExempt(currentPauseExempt);
            setResumeThreshold(
              currentResumeThreshold === null
                ? ''
                : String(currentResumeThreshold)
            );
            setValidationError(null);
            setOpen(true);
          }}
        >
          <Settings className="h-4 w-4" />
          {t('button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
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

            <Separator />

            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <Checkbox
                  id="pause-exempt"
                  checked={pauseExempt}
                  onCheckedChange={(checked) =>
                    setPauseExempt(checked === true)
                  }
                  className="mt-1"
                />
                <div className="grid gap-1.5 leading-none">
                  <Label
                    htmlFor="pause-exempt"
                    className="cursor-pointer font-medium text-sm"
                  >
                    {t('pauseExemptLabel')}
                  </Label>
                  <p className="text-muted-foreground text-xs">
                    {t('pauseExemptHelp')}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="resume-threshold">
                  {t('resumeThresholdLabel')}
                </Label>
                <Input
                  id="resume-threshold"
                  type="number"
                  min={0}
                  placeholder="120"
                  value={resumeThreshold}
                  onChange={(e) => setResumeThreshold(e.target.value)}
                  className="w-full"
                />
                <p className="text-muted-foreground text-xs">
                  {t('resumeThresholdHelp')}
                </p>
              </div>
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
