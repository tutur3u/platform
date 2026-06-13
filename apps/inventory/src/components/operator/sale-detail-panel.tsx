'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Save } from '@tuturuuu/icons';
import type { InventorySaleSummary } from '@tuturuuu/internal-api/inventory';
import {
  getInventorySale,
  updateInventorySale,
} from '@tuturuuu/internal-api/inventory';
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
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { operatorDialogContentClassName } from './operator-dialog';
import { LoadingRows } from './operator-shell';

export function SaleNoteDialog({
  sale,
  wsId,
}: {
  sale: InventorySaleSummary;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const detail = useQuery({
    enabled: open,
    queryFn: () => getInventorySale(wsId, sale.id),
    queryKey: ['inventory', wsId, 'sale', sale.id],
  });
  const currentNote = note || detail.data?.data.note || '';
  const mutation = useMutation({
    mutationFn: () => updateInventorySale(wsId, sale.id, { note: currentNote }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'sales'] });
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'sale'] });
    },
  });

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) setNote('');
        setOpen(nextOpen);
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="outline">
          <Pencil className="h-4 w-4" />
          {t('note')}
        </Button>
      </DialogTrigger>
      <DialogContent className={operatorDialogContentClassName('compact')}>
        <DialogHeader>
          <DialogTitle>{t('editSaleNoteTitle')}</DialogTitle>
          <DialogDescription>{t('editSaleNoteDescription')}</DialogDescription>
        </DialogHeader>
        {detail.isPending ? (
          <LoadingRows />
        ) : (
          <form
            className="grid gap-3"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            <label className="grid min-w-0 gap-1 text-sm">
              <span className="font-medium">{t('note')}</span>
              <Input
                onChange={(event) => setNote(event.target.value)}
                placeholder={t('placeholders.saleNote')}
                value={currentNote}
              />
            </label>
            <DialogFooter>
              <Button disabled={!sale.id || mutation.isPending} type="submit">
                <Save className="h-4 w-4" />
                {t('save')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
