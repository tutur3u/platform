'use client';

import { Settings } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
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
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { z } from 'zod';

interface ThresholdSettingsDialogProps {
  wsId: string;
  currentThreshold?: number;
  onUpdate: () => void;
}

const thresholdSchema = z.coerce
  .number({ message: 'Please enter a valid number' })
  .int('Threshold must be a whole number')
  .min(0, 'Threshold must be 0 or greater');

export function ThresholdSettingsDialog({
  wsId,
  currentThreshold = 1,
  onUpdate,
}: ThresholdSettingsDialogProps) {
  const t = useTranslations('time-tracker.requests.settings');
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(String(currentThreshold));
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Validate using Zod
  const validation = thresholdSchema.safeParse(inputValue);
  const isSubmitDisabled = !validation.success || isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Final validation before submit
    const result = thresholdSchema.safeParse(inputValue);
    if (!result.success) {
      setValidationError(result.error.issues[0]?.message ?? 'Invalid input');
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
          body: JSON.stringify({ threshold: result.data }),
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
            setInputValue(String(currentThreshold));
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
              <div className="rounded-md bg-dynamic-blue/5 p-3 text-sm">
                <p className="font-medium text-dynamic-blue">
                  {t('examples.title')}
                </p>
                <ul className="mt-2 space-y-1 text-muted-foreground">
                  <li>
                    <strong>0 {t('examples.days')}:</strong>{' '}
                    {t('examples.zero')}
                  </li>
                  <li>
                    <strong>1 {t('examples.day')}:</strong> {t('examples.one')}
                  </li>
                  <li>
                    <strong>7 {t('examples.days')}:</strong>{' '}
                    {t('examples.seven')}
                  </li>
                </ul>
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
