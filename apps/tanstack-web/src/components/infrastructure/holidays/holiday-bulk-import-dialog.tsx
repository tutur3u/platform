'use client';

import { Upload } from '@tuturuuu/icons';
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
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { parseHolidayBulkJson } from './holiday-utils';
import type { HolidayBulkImportValues } from './types';

type HolidayBulkImportDialogProps = {
  isPending?: boolean;
  onSubmit: (values: HolidayBulkImportValues) => Promise<void> | void;
};

const BULK_PLACEHOLDER = `[
  { "date": "2027-01-01", "name": "New Year" },
  { "date": "2027-01-28", "name": "Tet Day 1" }
]`;

export function HolidayBulkImportDialog({
  isPending,
  onSubmit,
}: HolidayBulkImportDialogProps) {
  const t = useTranslations('admin-holidays');
  const [open, setOpen] = useState(false);
  const [bulkJson, setBulkJson] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);

  const resetForm = () => {
    setBulkJson('');
    setReplaceExisting(false);
  };

  const handleSubmit = async () => {
    const parsed = (() => {
      try {
        return parseHolidayBulkJson(bulkJson);
      } catch {
        toast.error(t('invalid_json'));
        return null;
      }
    })();

    if (!parsed) return;

    if (!parsed.ok) {
      toast.error(t(parsed.reason));
      return;
    }

    try {
      await onSubmit({
        holidays: parsed.holidays,
        replaceExisting,
      });
      resetForm();
      setOpen(false);
    } catch {
      // The mutation hook owns server-side error toasts.
    }
  };

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) resetForm();
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button disabled={isPending} size="sm" variant="outline">
          <Upload className="h-4 w-4" />
          {t('bulk_import')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('bulk_import')}</DialogTitle>
          <DialogDescription>{t('bulk_import_description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('json_data')}</Label>
            <Textarea
              className="font-mono text-sm"
              onChange={(event) => setBulkJson(event.target.value)}
              placeholder={BULK_PLACEHOLDER}
              rows={8}
              value={bulkJson}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              checked={replaceExisting}
              id="replaceExisting"
              onCheckedChange={(value) => setReplaceExisting(Boolean(value))}
            />
            <Label className="font-normal" htmlFor="replaceExisting">
              {t('replace_existing')}
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={isPending}
            onClick={() => setOpen(false)}
            variant="outline"
          >
            {t('cancel')}
          </Button>
          <Button disabled={isPending} onClick={handleSubmit}>
            {isPending ? t('importing') : t('import')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
