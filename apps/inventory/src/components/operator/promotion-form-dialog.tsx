'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, TicketPercent } from '@tuturuuu/icons';
import {
  createInventoryPromotion,
  deleteInventoryPromotion,
  updateInventoryPromotion,
} from '@tuturuuu/internal-api/inventory';
import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import {
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';
import {
  NumberField,
  SelectValueField,
  TextAreaField,
  TextField,
} from './operator-form-fields';
import { LifecyclePanel } from './operator-lifecycle';
import {
  buildPromotionPayload,
  emptyPromotionForm,
  isPromotionFormValid,
  promotionFormFromRow,
} from './promotion-form';

function invalidatePromotions(
  queryClient: ReturnType<typeof useQueryClient>,
  wsId: string
) {
  queryClient.invalidateQueries({
    queryKey: ['inventory', wsId, 'promotions'],
  });
  queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
}

export function PromotionFormDialog({
  promotion,
  trigger,
  wsId,
}: {
  promotion?: ProductPromotion;
  trigger?: ReactNode;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.promotions');
  const forms = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() =>
    promotion ? promotionFormFromRow(promotion) : emptyPromotionForm()
  );
  const isEdit = Boolean(promotion);

  const resetForm = () =>
    setForm(promotion ? promotionFormFromRow(promotion) : emptyPromotionForm());

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = buildPromotionPayload(form);
      if (promotion?.id) {
        await updateInventoryPromotion(wsId, promotion.id, payload);
        return;
      }
      await createInventoryPromotion(wsId, payload);
    },
    onError: () => toast.error(forms('saveError')),
    onSuccess: () => {
      toast.success(forms('saveSuccess'));
      setOpen(false);
      invalidatePromotions(queryClient, wsId);
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (promotion?.id) await deleteInventoryPromotion(wsId, promotion.id);
    },
    onError: () => toast.error(forms('deleteError')),
    onSuccess: () => {
      toast.success(forms('deleteSuccess'));
      setOpen(false);
      invalidatePromotions(queryClient, wsId);
    },
  });

  const canSave = isPromotionFormValid(form);

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) resetForm();
        setOpen(nextOpen);
      }}
      open={open}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button">
            <TicketPercent className="h-4 w-4" />
            {t('newPromotion')}
          </Button>
        )}
      </DialogTrigger>
      <OperatorDialogContent size="md">
        <OperatorDialogHeader
          description={isEdit ? t('editDescription') : t('createDescription')}
          title={isEdit ? t('editPromotion') : t('newPromotion')}
        />
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSave) saveMutation.mutate();
          }}
        >
          <OperatorDialogBody className="grid gap-4">
            <div className="grid gap-3 md:grid-cols-2">
              <TextField
                label={forms('productName')}
                onChange={(name) => setForm((c) => ({ ...c, name }))}
                placeholder={forms('placeholders.productName')}
                value={form.name}
              />
              <TextField
                hint={t('hints.code')}
                label={t('code')}
                onChange={(code) =>
                  setForm((c) => ({ ...c, code: code.toUpperCase() }))
                }
                placeholder="SAVE10"
                value={form.code}
              />
              <SelectValueField
                allowEmpty={false}
                hint={t('hints.unit')}
                label={t('unit')}
                onChange={(unit) =>
                  setForm((c) => ({
                    ...c,
                    unit: unit === 'currency' ? 'currency' : 'percentage',
                  }))
                }
                options={[
                  { label: t('units.percentage'), value: 'percentage' },
                  { label: t('units.currency'), value: 'currency' },
                ]}
                placeholder={t('unit')}
                value={form.unit}
              />
              <NumberField
                hint={t('hints.value')}
                label={t('value')}
                onChange={(value) => setForm((c) => ({ ...c, value }))}
                placeholder={form.unit === 'percentage' ? '10' : '5'}
                value={form.value}
              />
              <NumberField
                hint={t('hints.maxUses')}
                label={t('maxUses')}
                onChange={(maxUses) => setForm((c) => ({ ...c, maxUses }))}
                placeholder={t('unlimited')}
                value={form.maxUses}
              />
              <TextAreaField
                className="md:col-span-2"
                label={forms('description')}
                onChange={(description) =>
                  setForm((c) => ({ ...c, description }))
                }
                placeholder={forms('placeholders.productDescription')}
                value={form.description}
              />
            </div>
            {isEdit ? (
              <LifecyclePanel
                deletePending={deleteMutation.isPending}
                onDelete={() => deleteMutation.mutate()}
                title={forms('lifecycle')}
              />
            ) : null}
          </OperatorDialogBody>
          <OperatorDialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {forms('cancel')}
              </Button>
            </DialogClose>
            <Button disabled={!canSave || saveMutation.isPending} type="submit">
              {saveMutation.isPending
                ? forms('saving')
                : isEdit
                  ? forms('save')
                  : forms('create')}
            </Button>
          </OperatorDialogFooter>
        </form>
      </OperatorDialogContent>
    </Dialog>
  );
}

export function PromotionEditButton({
  promotion,
  wsId,
}: {
  promotion: ProductPromotion;
  wsId: string;
}) {
  const forms = useTranslations('inventory.operator.forms');

  return (
    <PromotionFormDialog
      promotion={promotion}
      trigger={
        <Button size="sm" type="button" variant="outline">
          <Pencil className="h-4 w-4" />
          {forms('edit')}
        </Button>
      }
      wsId={wsId}
    />
  );
}
