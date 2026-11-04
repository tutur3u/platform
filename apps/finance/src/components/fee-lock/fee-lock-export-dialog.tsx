'use client';

import { FileSpreadsheet } from '@tuturuuu/icons';
import { exportFeeLocks } from '@tuturuuu/internal-api/finance-fee-lock';
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
import { RadioGroup, RadioGroupItem } from '@tuturuuu/ui/radio-group';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';

/**
 * Copy for the dialog, keyed like the design's `ws-fee-lock` keys (§2.4) so the
 * page maps each to `t(key)`; the page owns the namespace.
 */
export interface FeeLockExportLabels {
  export: string;
  export_title: string;
  export_locked_only: string;
  export_all: string;
  export_include_notice: string;
  export_too_many: (count: number) => string;
  export_done: (count: number) => string;
  export_failed: string;
  cancel: string;
}

interface Props {
  wsId: string;
  /** `YYYY-MM`, fixed to the month the page shows. */
  month: string;
  groupId?: string;
  labels: FeeLockExportLabels;
}

const STATUSES = ['locked', 'all'] as const;
type ExportStatus = (typeof STATUSES)[number];

function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** "Xuất Excel": the server builds the workbook; nothing is stored. */
export function FeeLockExportDialog({ wsId, month, groupId, labels }: Props) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ExportStatus>('locked');
  const [includeNotice, setIncludeNotice] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [year, monthNumber] = month.split('-');

  async function run() {
    setPending(true);
    setError(null);
    try {
      const result = await exportFeeLocks(wsId, {
        month,
        groupId,
        status,
        include_notice: includeNotice,
      });
      if (!result.ok) {
        setError(labels.export_too_many(result.tooMany));
        return;
      }
      saveFile(result.blob, result.fileName);
      toast.success(labels.export_done(result.rowCount));
      setOpen(false);
    } catch {
      setError(labels.export_failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileSpreadsheet className="h-4 w-4" />
          {labels.export}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labels.export_title}</DialogTitle>
          <DialogDescription>{`${monthNumber}/${year}`}</DialogDescription>
        </DialogHeader>
        <RadioGroup
          value={status}
          onValueChange={(value) => setStatus(value as ExportStatus)}
        >
          {STATUSES.map((value) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem id={`fee-lock-export-${value}`} value={value} />
              <Label htmlFor={`fee-lock-export-${value}`}>
                {value === 'locked'
                  ? labels.export_locked_only
                  : labels.export_all}
              </Label>
            </div>
          ))}
        </RadioGroup>
        <div className="flex items-center gap-2">
          <Checkbox
            id="fee-lock-export-notice"
            checked={includeNotice}
            onCheckedChange={(checked) => setIncludeNotice(checked === true)}
          />
          <Label htmlFor="fee-lock-export-notice">
            {labels.export_include_notice}
          </Label>
        </div>
        {error && (
          <p role="alert" className="text-dynamic-red text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {labels.cancel}
          </Button>
          <Button onClick={run} disabled={pending}>
            {labels.export}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
