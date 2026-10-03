'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitMerge, Loader2 } from '@tuturuuu/icons';
import {
  applyInventoryMerge,
  previewInventoryMerge,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { Dialog, DialogTrigger } from '@tuturuuu/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import {
  InventoryMergeBlocker,
  type InventoryMergeLabels,
  InventoryMergeMetadata,
} from './inventory-merge-preview';
import {
  InventoryMergeProductSelect,
  useInventoryMergeProductLabels,
} from './inventory-merge-product-options';
import {
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';

type MergeOption = { id: string; name?: string | null };

export function InventoryMergeDialog({
  kind,
  options,
  wsId,
  onComplete,
  labels,
}: {
  kind: 'product' | 'warehouse';
  options: MergeOption[];
  wsId: string;
  onComplete?: () => void;
  labels?: InventoryMergeLabels;
}) {
  const t = useTranslations('inventory.operator.merge');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState('');
  const [targetId, setTargetId] = useState('');
  const [metadata, setMetadata] = useState<'source' | 'target'>('target');
  const [stockPolicy, setStockPolicy] = useState<'source' | 'target'>('target');
  const [confirmedVersion, setConfirmedVersion] = useState<string | null>(null);
  const validPair = Boolean(sourceId && targetId && sourceId !== targetId);
  const preview = useQuery({
    queryKey: ['inventory', wsId, 'merge-preview', kind, sourceId, targetId],
    queryFn: () => previewInventoryMerge(wsId, { kind, sourceId, targetId }),
    enabled: open && validPair,
    staleTime: 0,
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (
        !preview.data ||
        confirmedVersion !== preview.data.version ||
        preview.data.blockers.length
      )
        throw new Error('Preview required');
      return applyInventoryMerge(wsId, {
        kind,
        sourceId,
        targetId,
        version: preview.data.version,
        metadata,
        stockPolicy,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
      toast.success(t('success'));
      setOpen(false);
      onComplete?.();
    },
    onError: () => {
      toast.error(t('error'));
      setConfirmedVersion(null);
      void preview.refetch();
    },
  });
  const changeSelection = (setter: (value: string) => void, value: string) => {
    setter(value);
    setConfirmedVersion(null);
    mutation.reset();
  };
  const data = validPair ? preview.data : undefined;
  const recordName = (id: string, rows?: MergeOption[]) =>
    rows?.find((row) => row.id === id)?.name || id;
  const pending = mutation.isPending;
  const productLabels = useInventoryMergeProductLabels(
    wsId,
    data?.stock.map((row) => row.productId) ?? [],
    labels?.products
  );
  const resolvedLabels = [
    ...(labels?.products ?? []),
    ...(productLabels.data ?? []),
  ];
  const recordNamesReady = Boolean(data?.source.name && data?.target.name);
  const labelsReady =
    !data ||
    (recordNamesReady &&
      data.stock.every((row) =>
        resolvedLabels.some(
          (product) => product.id === row.productId && product.name
        )
      ));
  const selectionRef = useId();
  const confirmationId = useId();

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (pending) return;
        setOpen(nextOpen);
        setConfirmedVersion(null);
        mutation.reset();
        if (nextOpen) {
          setSourceId('');
          setTargetId('');
          setMetadata('target');
          setStockPolicy('target');
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          disabled={kind === 'warehouse' && options.length < 2}
          className="min-h-11 w-full touch-manipulation sm:w-auto"
          type="button"
          size="sm"
          variant="outline"
        >
          <GitMerge className="h-4 w-4" />
          {t(kind === 'product' ? 'products' : 'warehouses')}
        </Button>
      </DialogTrigger>
      <OperatorDialogContent
        mobileFullscreen
        size="md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document
            .getElementById(selectionRef)
            ?.querySelector<HTMLElement>('[role="combobox"]')
            ?.focus();
        }}
      >
        <OperatorDialogHeader
          title={t(kind === 'product' ? 'products' : 'warehouses')}
          description={t('description')}
        />
        <OperatorDialogBody className="grid min-w-0 content-start gap-5 break-words">
          <div
            id={selectionRef}
            tabIndex={-1}
            className="grid min-w-0 gap-3 outline-none sm:grid-cols-2"
          >
            {kind === 'product' ? (
              <>
                <InventoryMergeProductSelect
                  wsId={wsId}
                  label={t('source')}
                  value={sourceId}
                  excludeId={targetId}
                  disabled={pending}
                  onChange={(value) => changeSelection(setSourceId, value)}
                />
                <InventoryMergeProductSelect
                  wsId={wsId}
                  label={t('destination')}
                  value={targetId}
                  excludeId={sourceId}
                  disabled={pending}
                  onChange={(value) => changeSelection(setTargetId, value)}
                />
              </>
            ) : (
              <>
                <MergeSelect
                  searchable
                  label={t('source')}
                  value={sourceId}
                  onChange={(value) => changeSelection(setSourceId, value)}
                  options={options.filter((option) => option.id !== targetId)}
                  disabled={pending}
                  placeholder={t('choose')}
                />
                <MergeSelect
                  searchable
                  label={t('destination')}
                  value={targetId}
                  onChange={(value) => changeSelection(setTargetId, value)}
                  options={options.filter((option) => option.id !== sourceId)}
                  disabled={pending}
                  placeholder={t('choose')}
                />
              </>
            )}
          </div>
          {validPair && preview.isFetching ? (
            <p
              role="status"
              className="flex items-center gap-2 text-muted-foreground text-sm"
            >
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('loading')}
            </p>
          ) : null}
          {preview.isError && validPair ? (
            <div role="alert" className="grid gap-2 text-sm">
              <p className="text-destructive">{t('previewError')}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setConfirmedVersion(null);
                  void preview.refetch();
                }}
              >
                {t('refresh')}
              </Button>
            </div>
          ) : null}
          {data && !preview.isError ? (
            <>
              <p className="rounded-md bg-muted p-3 text-sm">
                {t('unitsNotice')}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <MergeSelect
                  label={t('metadata')}
                  value={metadata}
                  onChange={(value) => {
                    setMetadata(value as 'source' | 'target');
                    setConfirmedVersion(null);
                  }}
                  options={[
                    { id: 'source', name: t('source') },
                    { id: 'target', name: t('destination') },
                  ]}
                  disabled={pending}
                  placeholder={t('choose')}
                />
                <MergeSelect
                  label={t('stockPolicy')}
                  value={stockPolicy}
                  onChange={(value) => {
                    setStockPolicy(value as 'source' | 'target');
                    setConfirmedVersion(null);
                  }}
                  options={[
                    { id: 'source', name: t('source') },
                    { id: 'target', name: t('destination') },
                  ]}
                  disabled={pending}
                  placeholder={t('choose')}
                />
              </div>
              <p className="text-muted-foreground text-sm">
                {t('metadataNotice')}
              </p>
              <InventoryMergeMetadata data={data} kind={kind} labels={labels} />
              {!labelsReady ? (
                <div
                  role={
                    productLabels.isError || !recordNamesReady
                      ? 'alert'
                      : 'status'
                  }
                  className="grid gap-2 text-sm"
                >
                  <p>
                    {t(
                      productLabels.isError || !recordNamesReady
                        ? 'labelsError'
                        : 'loading'
                    )}
                  </p>
                  {productLabels.isError || !recordNamesReady ? (
                    <Button
                      className="min-h-11"
                      variant="outline"
                      onClick={() => {
                        if (!recordNamesReady) void preview.refetch();
                        else void productLabels.refetch();
                      }}
                    >
                      {t('refresh')}
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {mutation.isError ? (
                <p role="alert" className="text-destructive text-sm">
                  {t('error')}
                </p>
              ) : null}
              <div className="grid gap-2">
                <h3 className="font-semibold text-sm">
                  {t('stockTitle', { count: data.stock.length })}
                </h3>
                <p className="text-muted-foreground text-sm">
                  {t('stockNotice')}
                </p>
                {data.stock.map((row) => (
                  <div
                    key={`${row.productId}:${row.warehouseId}:${row.unitId}`}
                    className="grid min-w-0 gap-1 rounded-md border p-3 text-sm [overflow-wrap:anywhere]"
                  >
                    <p className="break-all text-muted-foreground text-xs">
                      {t('stockIdentity', {
                        product:
                          resolvedLabels.find(
                            (product) => product.id === row.productId
                          )?.name || t('loading'),
                        warehouse: recordName(
                          row.warehouseId,
                          labels?.warehouses
                        ),
                        unit: recordName(row.unitId, labels?.units),
                      })}
                    </p>
                    <p>
                      {t('amounts', {
                        source: row.sourcePresent
                          ? row.sourceAmount === null
                            ? t('unlimited')
                            : String(row.sourceAmount)
                          : t('absent'),
                        target: row.targetPresent
                          ? row.targetAmount === null
                            ? t('unlimited')
                            : String(row.targetAmount)
                          : t('absent'),
                      })}
                    </p>
                    <p>
                      {t('prices', {
                        source: row.sourcePrice,
                        target: row.targetPrice,
                      })}
                    </p>
                    <p>
                      {t('minimums', {
                        source: row.sourcePresent
                          ? String(row.sourceMinAmount)
                          : t('absent'),
                        target: row.targetPresent
                          ? String(row.targetMinAmount)
                          : t('absent'),
                      })}
                    </p>
                    <p>
                      {t('shares', {
                        source: row.sourcePresent
                          ? `${row.sourceRevenueShareBps / 100}% · ${row.sourceRevenueSharePartnerId ? recordName(row.sourceRevenueSharePartnerId, labels?.owners) : t('notSet')}`
                          : t('absent'),
                        target: row.targetPresent
                          ? `${row.targetRevenueShareBps / 100}% · ${row.targetRevenueSharePartnerId ? recordName(row.targetRevenueSharePartnerId, labels?.owners) : t('notSet')}`
                          : t('absent'),
                      })}
                    </p>
                    {row.conflict ? (
                      <p className="font-medium text-destructive">
                        {t('conflict')}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
              <p className="text-sm">
                {t('references', {
                  count: data.references.reduce(
                    (total, reference) => total + reference.count,
                    0
                  ),
                })}
              </p>
              {data.blockers.length ? (
                <div
                  role="alert"
                  className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm"
                >
                  <p className="font-medium text-destructive">{t('blocked')}</p>
                  <ul className="mt-2 list-inside list-disc">
                    {[...new Set(data.blockers)].map((blocker) => (
                      <li key={blocker}>
                        <InventoryMergeBlocker code={blocker} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <label
                htmlFor={confirmationId}
                className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border p-3 text-sm"
              >
                <Checkbox
                  id={confirmationId}
                  aria-label={t('confirmation')}
                  checked={confirmedVersion === data.version}
                  disabled={
                    pending ||
                    preview.isFetching ||
                    !labelsReady ||
                    data.blockers.length > 0
                  }
                  onCheckedChange={(checked) =>
                    setConfirmedVersion(checked === true ? data.version : null)
                  }
                />
                <span>{t('confirmation')}</span>
              </label>
            </>
          ) : null}
        </OperatorDialogBody>
        <OperatorDialogFooter>
          <Button
            type="button"
            className="min-h-11 touch-manipulation"
            variant="ghost"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            {t('cancel')}
          </Button>
          <Button
            className="min-h-11 touch-manipulation"
            type="button"
            disabled={
              !data ||
              confirmedVersion !== data.version ||
              preview.isFetching ||
              preview.isError ||
              !labelsReady ||
              data.blockers.length > 0 ||
              pending
            }
            onClick={() => mutation.mutate()}
          >
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <GitMerge className="h-4 w-4" />
            )}
            {t('confirm')}
          </Button>
        </OperatorDialogFooter>
      </OperatorDialogContent>
    </Dialog>
  );
}

function MergeSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  placeholder,
  searchable = false,
}: {
  searchable?: boolean;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: MergeOption[];
  disabled: boolean;
  placeholder: string;
}) {
  const id = useId();
  const t = useTranslations('inventory.operator.merge');
  if (searchable)
    return (
      <div className="grid min-w-0 gap-1 text-sm">
        <span className="font-medium">{label}</span>
        <Combobox
          ariaLabel={label}
          selected={value}
          onChange={(next) => onChange(typeof next === 'string' ? next : '')}
          options={options.map((option) => ({
            value: option.id,
            label: option.name || option.id,
          }))}
          disabled={disabled}
          placeholder={placeholder}
          searchPlaceholder={t('searchWarehouses')}
          emptyText={t('noWarehouses')}
          className="min-w-0 [&_button[role=combobox]]:min-h-11 [&_button[role=combobox]]:touch-manipulation"
          contentClassName="max-w-[calc(100vw-2rem)] [&_[cmdk-item]]:min-h-11"
        />
      </div>
    );
  return (
    <div className="grid min-w-0 gap-1 text-sm">
      <label htmlFor={id} className="font-medium">
        {label}
      </label>
      <Select disabled={disabled} value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="min-h-11 w-full touch-manipulation">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name || option.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
