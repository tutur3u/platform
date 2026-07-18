'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Package, Pencil, Save, User } from '@tuturuuu/icons';
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
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { formatDate, StatusBadge } from './commerce-shared';
import {
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';
import { currency } from './operator-format';
import { LifecyclePanel } from './operator-lifecycle';
import { LoadingRows } from './operator-shell';
import { useWorkspaceCurrency } from './workspace-currency';

export function SaleNoteDialog({
  sale,
  wsId,
}: {
  sale: InventorySaleSummary;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const commerceT = useTranslations('inventory.operator.commerce');
  const locale = useLocale();
  const workspaceCurrency = useWorkspaceCurrency();
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
        <Button
          className="w-full touch-manipulation sm:w-auto"
          size="sm"
          type="button"
          variant="outline"
        >
          <Pencil className="h-4 w-4" />
          {commerceT('details')}
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
              {detail.data?.data ? (
                <div className="grid gap-3">
                  <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {detail.data.data.notice?.trim() ||
                          detail.data.data.customer_name?.trim() ||
                          commerceT('saleFallback', {
                            id: detail.data.data.id.slice(0, 8),
                          })}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                        <span>
                          {commerceT('items', {
                            count: detail.data.data.items_count,
                          })}
                        </span>
                        {formatDate(
                          detail.data.data.completed_at ??
                            detail.data.data.created_at,
                          locale
                        ) ? (
                          <span className="inline-flex items-center gap-1">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {formatDate(
                              detail.data.data.completed_at ??
                                detail.data.data.created_at,
                              locale
                            )}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="shrink-0 font-bold text-lg">
                      {currency(
                        detail.data.data.paid_amount,
                        detail.data.data.currency ?? workspaceCurrency
                      )}
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {detail.data.data.creator_name ? (
                      <DetailFact
                        icon={User}
                        label={commerceT('creatorLabel')}
                        value={detail.data.data.creator_name}
                      />
                    ) : null}
                    {detail.data.data.customer_name ? (
                      <DetailFact
                        icon={User}
                        label={commerceT('customerLabel')}
                        value={detail.data.data.customer_name}
                      />
                    ) : null}
                    {detail.data.data.wallet_name ? (
                      <DetailFact
                        label={commerceT('walletLabel')}
                        value={detail.data.data.wallet_name}
                      />
                    ) : null}
                    {detail.data.data.category_name ? (
                      <DetailFact
                        label={commerceT('categoryLabel')}
                        value={detail.data.data.category_name}
                      />
                    ) : null}
                  </div>
                  {detail.data.data.owners.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-muted-foreground text-xs">
                        {commerceT('ownersLabel')}
                      </span>
                      {[...new Set(detail.data.data.owners)].map((owner) => (
                        <StatusBadge key={owner} value={owner} />
                      ))}
                    </div>
                  ) : null}
                  {detail.data.data.lines.length > 0 ? (
                    <div className="grid gap-2">
                      <p className="font-medium text-sm">
                        {commerceT('lineItems')}
                      </p>
                      <div className="grid max-h-52 gap-1.5 overflow-y-auto">
                        {detail.data.data.lines.map((line) => (
                          <div
                            className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm"
                            key={`${line.product_id}:${line.unit_id}:${line.warehouse_id}`}
                          >
                            <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">
                                {line.product_name}
                              </p>
                              <p className="truncate text-muted-foreground text-xs">
                                {[
                                  line.owner_name,
                                  line.unit_name,
                                  line.warehouse_name,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </div>
                            <span className="shrink-0 text-muted-foreground text-xs">
                              {commerceT('quantity', { count: line.quantity })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
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

function DetailFact({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof User;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-border px-3 py-2">
      {Icon ? (
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      ) : null}
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <p className="truncate font-medium text-sm">{value}</p>
      </div>
    </div>
  );
}
