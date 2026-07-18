'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw } from '@tuturuuu/icons';
import {
  type InventorySquareCatalogSyncDirection,
  syncInventorySquareCatalog,
} from '@tuturuuu/internal-api/inventory';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@tuturuuu/ui/accordion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose } from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useState } from 'react';
import {
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
  OperatorDialogTabs,
} from './operator-dialog-shell';

const directions: InventorySquareCatalogSyncDirection[] = [
  'from_square',
  'to_square',
  'bidirectional',
];

const directionIcons = {
  bidirectional: <RefreshCw className="size-4" />,
  from_square: <ArrowDownToLine className="size-4" />,
  to_square: <ArrowUpFromLine className="size-4" />,
} satisfies Record<InventorySquareCatalogSyncDirection, ReactNode>;

export function SquareCatalogSyncDialog({
  connected,
  onOpenChange,
  open,
  wsId,
}: {
  connected: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.square.sync');
  const queryClient = useQueryClient();
  const [direction, setDirection] =
    useState<InventorySquareCatalogSyncDirection>('from_square');
  const sync = useMutation({
    mutationFn: (nextDirection: InventorySquareCatalogSyncDirection) =>
      syncInventorySquareCatalog(wsId, nextDirection),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('error')),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'square-catalog-sync'],
      }),
    onSuccess: (summary) => {
      toast.success(summary.conflicts > 0 ? t('partialSuccess') : t('success'));
      onOpenChange(false);
    },
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <OperatorDialogContent mobileFullscreen size="lg">
        <OperatorDialogHeader
          description={t('dialogDescription')}
          title={t('dialogTitle')}
        />
        <OperatorDialogTabs
          onValueChange={(value) =>
            setDirection(value as InventorySquareCatalogSyncDirection)
          }
          tabs={directions.map((item) => ({
            badge:
              item === 'from_square' ? (
                <span>{t('recommended')}</span>
              ) : (
                <span>{t('writesToSquare')}</span>
              ),
            content: (
              <div className="grid gap-5">
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <p className="font-semibold text-sm">
                    {t(`actions.${item}`)}
                  </p>
                  <p className="mt-1 text-muted-foreground text-sm leading-6">
                    {t(`confirm.${item}`)}
                  </p>
                </div>
                <Accordion
                  className="rounded-lg border border-border px-4"
                  collapsible
                  defaultValue="changes"
                  type="single"
                >
                  <AccordionItem value="changes">
                    <AccordionTrigger>{t('changesTitle')}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-6">
                      {t(`changes.${item}`)}
                    </AccordionContent>
                  </AccordionItem>
                  <AccordionItem value="protections">
                    <AccordionTrigger>{t('protectionsTitle')}</AccordionTrigger>
                    <AccordionContent className="grid gap-2 text-muted-foreground leading-6">
                      <p>{t('safetyDescription')}</p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Badge variant="success">{t('noDeletes')}</Badge>
                        <Badge variant="outline">{t('reviewConflicts')}</Badge>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                {!connected ? (
                  <p className="rounded-lg border border-dynamic-orange/30 bg-dynamic-orange/5 p-3 text-dynamic-orange text-sm">
                    {t('connectFirst')}
                  </p>
                ) : null}
              </div>
            ),
            icon: directionIcons[item],
            label: t(`actions.${item}`),
            value: item,
          }))}
          value={direction}
        />
        <OperatorDialogFooter>
          <DialogClose asChild>
            <Button disabled={sync.isPending} type="button" variant="outline">
              {t('cancel')}
            </Button>
          </DialogClose>
          <Button
            disabled={!connected || sync.isPending}
            onClick={() => sync.mutate(direction)}
            type="button"
          >
            <RefreshCw className={sync.isPending ? 'animate-spin' : ''} />
            {sync.isPending
              ? t('status.running')
              : t('startAction', { action: t(`actions.${direction}`) })}
          </Button>
        </OperatorDialogFooter>
      </OperatorDialogContent>
    </Dialog>
  );
}
