'use client';

import { Info } from '@tuturuuu/icons';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { StandardInvoice } from './standard-invoice';
import { SubscriptionInvoice } from './subscription-invoice';

interface Props {
  wsId: string;
}

export default function NewInvoicePage({ wsId }: Props) {
  const t = useTranslations();
  const searchParams = useSearchParams();

  // Read URL params for prefilling
  const urlInvoiceType = searchParams.get('type') || 'subscription';
  const urlAmount = searchParams.get('amount');
  const prefillAmount = urlAmount ? parseInt(urlAmount, 10) : undefined;

  const [multipleInvoices, setMultipleInvoices] = useState<boolean>(false);
  const [printAfterCreate, setPrintAfterCreate] = useState<boolean>(false);

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-invoices.new_invoice')}
        singularTitle={t('ws-invoices.new_invoice')}
      />
      <Separator className="my-4" />
      <Tabs defaultValue={urlInvoiceType} className="w-full">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="standard">
              {t('ws-invoices.standard_invoice')}
            </TabsTrigger>
            <TabsTrigger value="subscription">
              {t('ws-invoices.subscription_invoice')}
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center justify-center gap-4">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 space-y-1">
                <Label htmlFor="multiple-invoices">
                  {t('ws-invoices.create_multiple_invoices')}
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('ws-invoices.create_multiple_invoices_tooltip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Switch
                id="multiple-invoices"
                checked={multipleInvoices}
                onCheckedChange={(v) => {
                  setMultipleInvoices(v);
                  if (v) setPrintAfterCreate(false);
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 space-y-1">
                <Label htmlFor="print-after-create">
                  {t('ws-invoices.print_after_create')}
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{t('ws-invoices.print_after_create_tooltip')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Switch
                id="print-after-create"
                checked={printAfterCreate}
                disabled={multipleInvoices}
                onCheckedChange={setPrintAfterCreate}
              />
            </div>
          </div>
        </div>

        <TabsContent value="standard" className="w-full">
          <StandardInvoice
            wsId={wsId}
            createMultipleInvoices={multipleInvoices}
            printAfterCreate={printAfterCreate}
          />
        </TabsContent>

        <TabsContent value="subscription" className="w-full">
          <SubscriptionInvoice
            wsId={wsId}
            prefillAmount={prefillAmount}
            createMultipleInvoices={multipleInvoices}
            printAfterCreate={printAfterCreate}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
