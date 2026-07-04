'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet } from '@tuturuuu/icons';
import {
  type InventoryCostImportPreview,
  importInventoryCostingCsv,
} from '@tuturuuu/internal-api/inventory';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  FormSection,
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';
import { currency } from './operator-format';
import { useWorkspaceCurrency } from './workspace-currency';

export function CostingImportDialog({ wsId }: { wsId: string }) {
  const t = useTranslations('inventory.operator.costing');
  const forms = useTranslations('inventory.operator.forms');
  const queryClient = useQueryClient();
  const wsCurrency = useWorkspaceCurrency();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState('');
  const [preview, setPreview] = useState<InventoryCostImportPreview | null>(
    null
  );
  const previewMutation = useMutation({
    mutationFn: () => importInventoryCostingCsv(wsId, { csv }),
    onError: () => toast.error(t('importError')),
    onSuccess: (data) => setPreview(data),
  });
  const commitMutation = useMutation({
    mutationFn: () => importInventoryCostingCsv(wsId, { commit: true, csv }),
    onError: () => toast.error(t('importError')),
    onSuccess: (data) => {
      setPreview(data);
      queryClient.invalidateQueries({ queryKey: ['inventory', wsId] });
      setOpen(false);
      setCsv('');
    },
  });

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <FileSpreadsheet className="h-4 w-4" />
          {t('importCsv')}
        </Button>
      </DialogTrigger>
      <OperatorDialogContent size="lg">
        <OperatorDialogHeader
          description={t('importDescription')}
          title={t('importTitle')}
        />
        <OperatorDialogBody className="grid gap-6">
          <FormSection
            icon={<FileSpreadsheet className="h-4 w-4" />}
            title={t('importTitle')}
          >
            <Textarea
              className="min-h-48 font-mono"
              onChange={(event) => setCsv(event.target.value)}
              placeholder={t('importPlaceholder')}
              value={csv}
            />
          </FormSection>
          {preview ? (
            <div className="grid gap-3">
              {preview.warnings.length > 0 ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm">
                  {preview.warnings.join(' ')}
                </div>
              ) : null}
              {preview.rows.length > 0 ? (
                <div className="overflow-x-auto rounded-md border border-border">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">{t('item')}</th>
                        <th className="px-3 py-2">{t('batchSize')}</th>
                        <th className="px-3 py-2">{t('unitCost')}</th>
                        <th className="px-3 py-2">{t('artCommission')}</th>
                        <th className="px-3 py-2">{t('shipping')}</th>
                        <th className="px-3 py-2">{t('retail')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, index) => (
                        <tr
                          className="border-border border-t"
                          key={`${row.itemCategory}-${row.batchSize}-${index}`}
                        >
                          <td className="px-3 py-2">{row.itemCategory}</td>
                          <td className="px-3 py-2">{row.batchSize}</td>
                          <td className="px-3 py-2">
                            {currency(row.manufacturingCostPerUnit, wsCurrency)}
                          </td>
                          <td className="px-3 py-2">
                            {row.artCommissionCost
                              ? currency(row.artCommissionCost, wsCurrency)
                              : '-'}
                          </td>
                          <td className="px-3 py-2">
                            {row.shippingCost
                              ? currency(row.shippingCost, wsCurrency)
                              : '-'}
                          </td>
                          <td className="px-3 py-2">
                            {currency(row.targetRetailPrice, wsCurrency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  {t('importNoRows')}
                </p>
              )}
            </div>
          ) : null}
        </OperatorDialogBody>
        <OperatorDialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {forms('cancel')}
            </Button>
          </DialogClose>
          <Button
            disabled={!csv || previewMutation.isPending}
            onClick={() => previewMutation.mutate()}
            type="button"
            variant="outline"
          >
            {t('previewImport')}
          </Button>
          <Button
            disabled={!csv || commitMutation.isPending}
            onClick={() => commitMutation.mutate()}
            type="button"
          >
            {t('commitImport')}
          </Button>
        </OperatorDialogFooter>
      </OperatorDialogContent>
    </Dialog>
  );
}
