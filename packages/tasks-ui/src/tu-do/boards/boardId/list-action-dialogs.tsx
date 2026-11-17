import {
  Archive,
  ArrowRight,
  ArrowRightLeft,
  CircleCheck,
  Trash,
  TriangleAlert,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Kbd } from '@tuturuuu/ui/kbd';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

interface ArchiveProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listName: string;
  /** Name of the board's closed list, when it already exists. */
  closedListName?: string;
  count: number;
  onConfirm: () => void;
}

function ListChip({
  icon,
  name,
  count,
}: {
  icon: React.ReactNode;
  name: string;
  count?: number;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
      {icon}
      <span className="truncate font-medium">{name}</span>
      {typeof count === 'number' ? (
        <span className="rounded-full bg-muted px-1.5 text-muted-foreground tabular-nums">
          {count}
        </span>
      ) : null}
    </span>
  );
}

/** Confirming closes at once; progress and Undo continue in a toast. */
export function ArchiveTasksDialog({
  open,
  onOpenChange,
  listName,
  closedListName,
  count,
  onConfirm,
}: ArchiveProps) {
  const t = useTranslations('common');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <span className="mb-2 flex size-9 items-center justify-center rounded-full bg-muted">
            <Archive className="size-4" />
          </span>
          <DialogTitle>{t('archive_n_tasks_title', { count })}</DialogTitle>
          <DialogDescription>
            {t('archive_tasks_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 items-center gap-2">
          <ListChip
            count={count}
            icon={<CircleCheck className="size-3.5 text-dynamic-green" />}
            name={listName}
          />
          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
          <ListChip
            icon={<Archive className="size-3.5 text-muted-foreground" />}
            name={closedListName ?? t('closed')}
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('cancel')}
            <Kbd aria-hidden className="hidden sm:inline-flex">
              Esc
            </Kbd>
          </Button>
          <Button autoFocus onClick={onConfirm}>
            {t('archive_n_tasks_action', { count })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface DeleteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listName: string;
  count: number;
  onConfirm: () => void;
  onMoveFirst?: () => void;
}

/**
 * Focus starts on Cancel, so pressing Enter from the initial focus never
 * deletes the list.
 */
export function DeleteListDialog({
  open,
  onOpenChange,
  listName,
  count,
  onConfirm,
  onMoveFirst,
}: DeleteProps) {
  const t = useTranslations('common');
  const cancelRef = useRef<HTMLButtonElement>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancelRef.current?.focus();
        }}
      >
        <DialogHeader>
          <span className="mb-2 flex size-9 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Trash className="size-4" />
          </span>
          <DialogTitle>
            {t('delete_list_title', { name: listName })}
          </DialogTitle>
          <DialogDescription>{t('delete_list_description')}</DialogDescription>
        </DialogHeader>
        {count > 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {t('delete_list_task_warning', { count })}
              </p>
              {onMoveFirst ? (
                <p className="text-muted-foreground text-xs">
                  {t('delete_list_move_hint')}
                </p>
              ) : null}
            </div>
            {onMoveFirst ? (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                onClick={onMoveFirst}
              >
                <ArrowRightLeft className="size-3.5" />
                {t('move_tasks_first')}
              </Button>
            ) : null}
          </div>
        ) : null}
        <DialogFooter className="gap-2">
          <Button
            ref={cancelRef}
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('cancel')}
            <Kbd aria-hidden className="hidden sm:inline-flex">
              Esc
            </Kbd>
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            {t('delete_list')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
