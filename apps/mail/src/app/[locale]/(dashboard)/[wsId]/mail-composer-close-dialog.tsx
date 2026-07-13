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
import { Button } from '@tuturuuu/ui/button';

export function MailComposerCloseDialog({
  cancelLabel,
  description,
  discardLabel,
  onDiscard,
  onOpenChange,
  onSave,
  open,
  saveDisabled,
  saveLabel,
  title,
}: {
  cancelLabel: string;
  description: string;
  discardLabel: string;
  onDiscard: () => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  open: boolean;
  saveDisabled: boolean;
  saveLabel: string;
  title: string;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button onClick={onDiscard} variant="destructive">
              {discardLabel}
            </Button>
          </AlertDialogAction>
          <AlertDialogAction disabled={saveDisabled} onClick={onSave}>
            {saveLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
