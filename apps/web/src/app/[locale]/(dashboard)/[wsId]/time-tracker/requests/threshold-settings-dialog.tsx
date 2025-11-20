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

interface ThresholdSettingsDialogProps {
  wsId: string;
  currentThreshold?: number;
  onUpdate: () => void;
}

export function ThresholdSettingsDialog({
  wsId,
  currentThreshold = 1,
  onUpdate,
}: ThresholdSettingsDialogProps) {
  const t = useTranslations('time-tracker.requests.settings');
  const [open, setOpen] = useState(false);
  const [threshold, setThreshold] = useState(currentThreshold);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/time-tracking/threshold`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ threshold }),
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
            setThreshold(currentThreshold);
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
                value={threshold}
                onChange={(e) =>
                  setThreshold(Number.parseInt(e.target.value, 10))
                }
                required
                className="w-full"
              />
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
            <Button type="submit" disabled={isLoading}>
              {isLoading ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
