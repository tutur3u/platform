'use client';

import { Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useState } from 'react';

type Props = {
  creating?: boolean;
  onCreateBoard: (title: string) => void;
  trigger?: ReactNode;
};

export function CreateBoardDialog({ creating, onCreateBoard, trigger }: Props) {
  const t = useTranslations('mind');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');

  const submit = () => {
    const value = title.trim();
    if (!value) return;
    onCreateBoard(value);
    setTitle('');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button">
            <Plus className="h-4 w-4" />
            {t('actions.createBoard')}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('emptyState.title')}</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Input
            autoFocus
            disabled={creating}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('emptyState.placeholder')}
            value={title}
          />
          <DialogFooter>
            <Button disabled={creating || !title.trim()} type="submit">
              {t('actions.createBoard')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
