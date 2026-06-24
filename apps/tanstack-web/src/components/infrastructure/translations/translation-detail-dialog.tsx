import { Badge } from '@tuturuuu/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import type { FlatTranslation, TranslationStatus } from './types';

type TranslationDetailDialogProps = {
  labels: {
    english: string;
    key: string;
    status: Record<TranslationStatus, string>;
    vietnamese: string;
  };
  onOpenChange: (open: boolean) => void;
  row: FlatTranslation | null;
};

export function TranslationDetailDialog({
  labels,
  onOpenChange,
  row,
}: TranslationDetailDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(row)}>
      <DialogContent className="max-w-3xl">
        {row ? (
          <>
            <DialogHeader>
              <DialogTitle className="break-all font-mono text-base">
                {row.key}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-muted-foreground text-sm">
                  {labels.key}
                </span>
                <Badge variant="outline">{labels.status[row.status]}</Badge>
              </div>
              <TranslationValue label={labels.english} value={row.enValue} />
              <TranslationValue label={labels.vietnamese} value={row.viValue} />
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function TranslationValue({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="space-y-2">
      <div className="font-medium text-muted-foreground text-sm">{label}</div>
      <div className="max-h-56 overflow-auto rounded-md border bg-muted/30 p-3 text-sm">
        <pre className="whitespace-pre-wrap break-words font-sans">
          {value || '-'}
        </pre>
      </div>
    </div>
  );
}
