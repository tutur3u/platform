'use client';

import { useQueryClient } from '@tanstack/react-query';
import { GitMerge, X } from '@tuturuuu/icons';
import type { InventorySalesPeriod } from '@tuturuuu/internal-api/inventory';
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
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { InventorySeasonMergePreviewContent } from './inventory-season-merge-preview';
import { useInventoryActor } from './inventory-session-scope';
import {
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';

import {
  type Choice,
  useInventorySeasonMergeReview,
} from './use-inventory-season-merge-review';
export function InventorySeasonMergeDialog({
  wsId,
  periods,
}: {
  wsId: string;
  periods: InventorySalesPeriod[];
}) {
  const t = useTranslations('inventory.operator.seasonMerge');
  const client = useQueryClient();
  const actorId = useInventoryActor();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button
          className="min-h-11 shrink-0 touch-manipulation"
          variant="outline"
          size="sm"
          disabled={periods.filter((p) => !p.merged_into_id).length < 2}
        >
          <GitMerge className="size-4" />
          {t('title')}
        </Button>
      </DialogTrigger>
      {open ? (
        <SeasonMergeReview
          key={`${actorId}:${wsId}`}
          wsId={wsId}
          periods={periods}
          onPending={setPending}
          onClose={() => setOpen(false)}
          onComplete={async () => {
            await client.invalidateQueries({ queryKey: ['inventory', wsId] });
            setOpen(false);
          }}
        />
      ) : null}
    </Dialog>
  );
}

function SeasonMergeReview({
  wsId,
  periods,
  onClose,
  onComplete,
  onPending,
}: {
  wsId: string;
  periods: InventorySalesPeriod[];
  onClose: () => void;
  onComplete: () => Promise<void>;
  onPending: (value: boolean) => void;
}) {
  const {
    t,
    sourceId,
    targetId,
    setSourceId,
    setTargetId,
    descriptionPolicy,
    setDescription,
    rulePolicy,
    setRules,
    pricePolicy,
    setPrices,
    page,
    setPage,
    reviewedPage,
    setReviewedPage,
    setReviewedVersion,
    confirmed,
    setConfirmed,
    expired,
    selectionId,
    checkboxId,
    token,
    data,
    query,
    preview,
    labelsReady,
    valid,
    ruleConflicts,
    ready,
    pending,
    recovery,
    reviewLocked,
    submit,
    refresh,
    change,
  } = useInventorySeasonMergeReview({ wsId, onComplete, onPending });
  return (
    <OperatorDialogContent
      mobileFullscreen
      showCloseButton={false}
      size="md"
      onEscapeKeyDown={(event) => {
        if (pending) event.preventDefault();
      }}
      onPointerDownOutside={(event) => {
        if (pending) event.preventDefault();
      }}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        document
          .getElementById(selectionId)
          ?.querySelector<HTMLElement>('[role="combobox"]')
          ?.focus();
      }}
    >
      <OperatorDialogHeader
        className="pr-16 sm:pr-16"
        title={t('title')}
        description={t('description')}
      />
      <Button
        type="button"
        aria-label={t('cancel')}
        className="absolute top-2 right-2 size-11 touch-manipulation"
        variant="ghost"
        disabled={pending}
        onClick={onClose}
      >
        <X className="size-4" />
      </Button>
      <OperatorDialogBody className="grid min-w-0 content-start gap-4 [overflow-wrap:anywhere]">
        <div id={selectionId} className="grid min-w-0 gap-3 sm:grid-cols-2">
          {(['source', 'target'] as const).map((side) => (
            <div key={side} className="grid min-w-0 gap-1 text-sm">
              <span>{t(side)}</span>
              <Combobox
                ariaLabel={t(side)}
                selected={side === 'source' ? sourceId : targetId}
                onChange={(next) =>
                  change(
                    side === 'source' ? setSourceId : setTargetId,
                    typeof next === 'string' ? next : ''
                  )
                }
                disabled={reviewLocked}
                options={periods
                  .filter(
                    (p) =>
                      !p.merged_into_id &&
                      p.id !== (side === 'source' ? targetId : sourceId) &&
                      (side === 'source' || p.status === 'active')
                  )
                  .map((p) => ({ value: p.id, label: p.name }))}
                placeholder={t('choose')}
                searchPlaceholder={t('search')}
                emptyText={t('noOptions')}
                className="min-w-0 [&_button[role=combobox]]:min-h-11"
                contentClassName="max-w-[calc(100vw-2rem)] [&_[cmdk-item]]:min-h-11"
              />
            </div>
          ))}
        </div>
        {valid && query.isFetching ? <p role="status">{t('loading')}</p> : null}
        {recovery.request ? (
          <div
            role="status"
            className="grid gap-2 rounded-md border border-dashed p-3 text-sm opacity-80"
          >
            <p>
              {t(recovery.authPaused ? 'authPaused' : 'unknownOutcome', {
                source: recovery.request.sourceName,
                target: recovery.request.targetName,
              })}
            </p>
            <Button
              className="min-h-11"
              variant="outline"
              disabled={pending}
              onClick={recovery.retry}
            >
              {t(pending ? 'saving' : 'checkOutcome')}
            </Button>
          </div>
        ) : null}
        {!recovery.request &&
        (query.isError ||
          !!recovery.error ||
          recovery.storageError ||
          expired ||
          (data && !labelsReady)) ? (
          <div role="alert" className="grid gap-2 text-sm">
            <p>
              {t(
                recovery.storageError
                  ? 'storageError'
                  : expired
                    ? 'expired'
                    : 'error'
              )}
            </p>
            <Button
              className="min-h-11"
              variant="outline"
              disabled={pending || preview.isFetching}
              onClick={refresh}
            >
              {t('refresh')}
            </Button>
          </div>
        ) : null}
        {data ? (
          <>
            <InventorySeasonMergePreviewContent data={data} />
            <fieldset
              className="flex flex-wrap items-center gap-2"
              aria-label={t('pagination')}
            >
              <Button
                className="min-h-11"
                variant="outline"
                disabled={page <= 1 || pending || query.isFetching}
                onClick={() => {
                  setConfirmed(null);
                  setPage(page - 1);
                }}
              >
                {t('previous')}
              </Button>
              <span>{t('page', { page })}</span>
              <Button
                className="min-h-11"
                variant="outline"
                disabled={
                  !data.hasMore ||
                  pending ||
                  query.isFetching ||
                  query.isError ||
                  expired ||
                  !labelsReady ||
                  data.version !== token
                }
                onClick={() => {
                  setReviewedPage(Math.max(reviewedPage, page));
                  setReviewedVersion(token ?? null);
                  setConfirmed(null);
                  setPage(page + 1);
                }}
              >
                {t('next')}
              </Button>
            </fieldset>
            <Policy
              label={t('descriptionPolicy')}
              value={descriptionPolicy}
              onChange={(v) => {
                setDescription(v as Choice);
                setConfirmed(null);
              }}
              disabled={pending}
              options={[
                ['source', t('useSource')],
                ['target', t('useTarget')],
              ]}
            />
            <Policy
              label={t('rulePolicy')}
              value={rulePolicy}
              onChange={(v) => {
                setRules(v as Choice);
                setConfirmed(null);
              }}
              disabled={pending}
              options={[
                ['source', t('useSource')],
                ['target', t('useTarget')],
              ]}
            />
            <Policy
              label={t('pricePolicy')}
              value={pricePolicy}
              onChange={(v) => {
                setPrices(v as typeof pricePolicy);
                setConfirmed(null);
              }}
              disabled={pending}
              options={[
                ['block', t('blockPrices')],
                ['target', t('targetPrices')],
              ]}
            />
            {ruleConflicts > 0 ? (
              <p role="alert" className="text-destructive">
                {t('ruleBlocked', { count: ruleConflicts })}
              </p>
            ) : null}
            {pricePolicy === 'block' && data.conflictCount > 0 ? (
              <p role="alert" className="text-destructive">
                {t('priceBlocked')}
              </p>
            ) : null}
            <label
              htmlFor={checkboxId}
              className="flex min-h-11 items-start gap-3 rounded-md border p-3 text-sm"
            >
              <Checkbox
                id={checkboxId}
                aria-label={t('acknowledge')}
                disabled={!ready || pending}
                checked={confirmed === token}
                onCheckedChange={(value) =>
                  setConfirmed(value === true ? (token ?? null) : null)
                }
              />
              <span>{t('acknowledge')}</span>
            </label>
          </>
        ) : null}
      </OperatorDialogBody>
      <OperatorDialogFooter>
        <Button
          className="min-h-11"
          variant="ghost"
          disabled={pending}
          onClick={onClose}
        >
          {t('cancel')}
        </Button>
        <Button
          className="min-h-11"
          disabled={!ready || confirmed !== token || pending}
          onClick={submit}
        >
          {t(pending ? 'saving' : 'confirm')}
        </Button>
      </OperatorDialogFooter>
    </OperatorDialogContent>
  );
}
function Policy({
  label,
  value,
  onChange,
  disabled,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  options: [string, string][];
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-1 text-sm">
      <label htmlFor={id}>{label}</label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id={id} className="min-h-11 w-full">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map(([id, text]) => (
            <SelectItem key={id} value={id} className="min-h-11">
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
