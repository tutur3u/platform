import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import type { ComposerWarning } from './mail-composer-utils';

export function MailComposerSendReview({
  cancelLabel,
  description,
  onConfirm,
  onOpenChange,
  open,
  sendLabel,
  title,
  warningLabel,
  warnings,
}: {
  cancelLabel: string;
  description: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sendLabel: string;
  title: string;
  warningLabel: (warning: ComposerWarning) => string;
  warnings: ComposerWarning[];
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="space-y-2 rounded-xl bg-foreground/[0.04] p-3 text-sm">
          {warnings.map((warning) => (
            <li className="flex gap-2" key={warning}>
              <span aria-hidden="true" className="text-muted-foreground">
                &bull;
              </span>
              {warningLabel(warning)}
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{sendLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
