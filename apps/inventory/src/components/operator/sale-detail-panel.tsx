'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Save } from '@tuturuuu/icons';
import type { InventorySaleSummary } from '@tuturuuu/internal-api/inventory';
import {
  deleteInventorySale,
  getInventorySale,
  updateInventorySale,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import {
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';
import { LifecyclePanel } from './operator-lifecycle';
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
  const deleteMutation = useMutation({
    mutationFn: () => deleteInventorySale(wsId, sale.id),
    onError: () => toast.error(t('deleteError')),
    onSuccess: () => {
      toast.success(t('deleteSuccess'));
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'sales'] });
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
      <OperatorDialogContent size="md">
        <OperatorDialogHeader
          description={t('editSaleNoteDescription')}
          title={t('editSaleNoteTitle')}
        />
        {detail.isPending ? (
          <OperatorDialogBody>
            <LoadingRows />
          </OperatorDialogBody>
        ) : (
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            <OperatorDialogBody className="grid gap-5">
              <label className="grid min-w-0 gap-1 text-sm">
                <span className="font-medium">{t('note')}</span>
                <Input
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t('placeholders.saleNote')}
                  value={currentNote}
                />
              </label>
              <LifecyclePanel
                deletePending={deleteMutation.isPending}
                onDelete={() => deleteMutation.mutate()}
                title={t('lifecycle')}
              />
            </OperatorDialogBody>
            <OperatorDialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  {t('cancel')}
                </Button>
              </DialogClose>
              <Button disabled={!sale.id || mutation.isPending} type="submit">
                <Save className="h-4 w-4" />
                {mutation.isPending ? t('saving') : t('save')}
              </Button>
            </OperatorDialogFooter>
          </form>
        )}
      </OperatorDialogContent>
    </Dialog>
  );
}
