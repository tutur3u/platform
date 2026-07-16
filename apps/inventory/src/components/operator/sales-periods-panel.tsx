'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  CalendarDays,
  Pencil,
  Plus,
  RotateCcw,
} from '@tuturuuu/icons';
import type {
  InventorySaleSummary,
  InventorySalesPeriod,
} from '@tuturuuu/internal-api/inventory';
import {
  createInventorySalesPeriod,
  setInventorySalePeriod,
  updateInventorySalesPeriod,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import {
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';

const ALL_PERIODS = '__all__';
const NO_PERIOD = '__none__';

export function SalesPeriodsPanel({
  onSelect,
  periods,
  selectedPeriodId,
  wsId,
}: {
  onSelect: (periodId: string) => void;
  periods: InventorySalesPeriod[];
  selectedPeriodId: string;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.commerce.periods');
  const queryClient = useQueryClient();
  const selected = periods.find((period) => period.id === selectedPeriodId);
  const lifecycleMutation = useMutation({
    mutationFn: (period: InventorySalesPeriod) =>
      updateInventorySalesPeriod(wsId, period.id, {
        status: period.status === 'active' ? 'archived' : 'active',
      }),
    onError: () => toast.error(t('saveError')),
    onSuccess: ({ data }) => {
      toast.success(
        data.status === 'archived' ? t('archivedSuccess') : t('restoredSuccess')
      );
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'sales-periods'],
      });
    },
  });

  return (
    <section className="grid gap-3 rounded-xl border border-primary/20 bg-primary/[0.035] p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
          <CalendarDays className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-sm">{t('title')}</p>
          <p className="mt-0.5 text-muted-foreground text-xs">
            {t('description')}
          </p>
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
        <Select
          onValueChange={(value) =>
            onSelect(value === ALL_PERIODS ? '' : value)
          }
          value={selectedPeriodId || ALL_PERIODS}
        >
          <SelectTrigger className="h-9 min-w-44 flex-1 sm:w-56 sm:flex-none">
            <SelectValue placeholder={t('all')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_PERIODS}>{t('all')}</SelectItem>
            {periods.map((period) => (
              <SelectItem key={period.id} value={period.id}>
                {period.name} · {period.sale_count}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected ? (
          <SalesPeriodDialog key={selected.id} period={selected} wsId={wsId} />
        ) : null}
        {selected ? (
          <Button
            disabled={lifecycleMutation.isPending}
            onClick={() => lifecycleMutation.mutate(selected)}
            size="sm"
            type="button"
            variant="outline"
          >
            {selected.status === 'active' ? (
              <Archive className="h-4 w-4" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            {selected.status === 'active' ? t('archive') : t('restore')}
          </Button>
        ) : null}
        <SalesPeriodDialog key="create" wsId={wsId} />
      </div>
    </section>
  );
}

function SalesPeriodDialog({
  period,
  wsId,
}: {
  period?: InventorySalesPeriod;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.commerce.periods');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(period?.name ?? '');
  const [description, setDescription] = useState(period?.description ?? '');
  const [startsAt, setStartsAt] = useState(period?.starts_at ?? '');
  const [endsAt, setEndsAt] = useState(period?.ends_at ?? '');
  const isEditing = Boolean(period);
  const mutation = useMutation({
    mutationFn: () =>
      period
        ? updateInventorySalesPeriod(wsId, period.id, {
            description: description.trim() || null,
            ends_at: endsAt || null,
            name: name.trim(),
            starts_at: startsAt || null,
          })
        : createInventorySalesPeriod(wsId, {
            description: description.trim() || null,
            ends_at: endsAt || null,
            name: name.trim(),
            starts_at: startsAt || null,
          }),
    onError: () => toast.error(t('saveError')),
    onSuccess: () => {
      toast.success(t(isEditing ? 'updatedSuccess' : 'createdSuccess'));
      setOpen(false);
      if (!isEditing) {
        setName('');
        setDescription('');
        setStartsAt('');
        setEndsAt('');
      }
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'sales-periods'],
      });
    },
  });

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          type="button"
          variant={isEditing ? 'outline' : 'default'}
        >
          {isEditing ? (
            <Pencil className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {t(isEditing ? 'edit' : 'create')}
        </Button>
      </DialogTrigger>
      <OperatorDialogContent size="sm">
        <OperatorDialogHeader
          description={t(isEditing ? 'editDescription' : 'createDescription')}
          title={t(isEditing ? 'editTitle' : 'createTitle')}
        />
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <OperatorDialogBody className="grid gap-4">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{t('name')}</span>
              <Input
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('namePlaceholder')}
                value={name}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t('startsAt')}</span>
                <Input
                  onChange={(event) => setStartsAt(event.target.value)}
                  type="date"
                  value={startsAt}
                />
              </label>
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">{t('endsAt')}</span>
                <Input
                  min={startsAt || undefined}
                  onChange={(event) => setEndsAt(event.target.value)}
                  type="date"
                  value={endsAt}
                />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">{t('notes')}</span>
              <Textarea
                maxLength={500}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t('notesPlaceholder')}
                rows={3}
                value={description}
              />
            </label>
          </OperatorDialogBody>
          <OperatorDialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t('cancel')}
              </Button>
            </DialogClose>
            <Button
              disabled={
                !name.trim() ||
                Boolean(startsAt && endsAt && startsAt > endsAt) ||
                mutation.isPending
              }
              type="submit"
            >
              {mutation.isPending
                ? t('saving')
                : t(isEditing ? 'save' : 'create')}
            </Button>
          </OperatorDialogFooter>
        </form>
      </OperatorDialogContent>
    </Dialog>
  );
}

export function SalePeriodPicker({
  periods,
  sale,
  wsId,
}: {
  periods: InventorySalesPeriod[];
  sale: InventorySaleSummary;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.commerce.periods');
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (periodId: string) =>
      setInventorySalePeriod(wsId, sale.id, {
        period_id: periodId === NO_PERIOD ? null : periodId,
        source: sale.source,
      }),
    onError: () => toast.error(t('assignError')),
    onSuccess: () => {
      toast.success(t('assignedSuccess'));
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId, 'sales'] });
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'sales-periods'],
      });
    },
  });

  return (
    <Select
      disabled={mutation.isPending}
      onValueChange={(value) => mutation.mutate(value)}
      value={sale.period?.id ?? NO_PERIOD}
    >
      <SelectTrigger
        aria-label={t('assignmentLabel')}
        className="h-8 w-auto min-w-36 max-w-52 text-xs"
      >
        <SelectValue placeholder={t('unassigned')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_PERIOD}>{t('unassigned')}</SelectItem>
        {periods.map((period) => (
          <SelectItem key={period.id} value={period.id}>
            {period.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
