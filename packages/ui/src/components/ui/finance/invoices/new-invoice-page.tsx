'use client';

import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Label } from '@tuturuuu/ui/label';
import { Separator } from '@tuturuuu/ui/separator';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { StandardInvoice } from './standard-invoice';
import { SubscriptionInvoice } from './subscription-invoice';

interface Props {
  wsId: string;
  defaultWalletId?: string;
}

export default function NewInvoicePage({ wsId, defaultWalletId }: Props) {
  const t = useTranslations();
  const searchParams = useSearchParams();

  const [createMultipleInvoices, setCreateMultipleInvoices] = useState(false);
  const [printAfterCreate, setPrintAfterCreate] = useState(true);

  useEffect(() => {
    const storedCreateMultipleInvoices = localStorage.getItem(
      'createMultipleInvoices'
    );
    if (storedCreateMultipleInvoices) {
      setCreateMultipleInvoices(storedCreateMultipleInvoices === 'true');
    }

    const storedPrintAfterCreate = localStorage.getItem('printAfterCreate');
    if (storedPrintAfterCreate) {
      setPrintAfterCreate(storedPrintAfterCreate === 'true');
    }
  }, []);

  const handleCreateMultipleInvoicesChange = (checked: boolean) => {
    setCreateMultipleInvoices(checked);
    localStorage.setItem('createMultipleInvoices', checked.toString());
  };

  const handlePrintAfterCreateChange = (checked: boolean) => {
    setPrintAfterCreate(checked);
    localStorage.setItem('printAfterCreate', checked.toString());
  };

  const invoiceType = searchParams.get('type') || 'standard';

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-invoices.new_invoice')}
        singularTitle={t('ws-invoices.new_invoice')}
      />
      <Separator className="my-4" />
      <Tabs
        defaultValue={invoiceType}
        className="w-full"
        onValueChange={(value) => {
          // Update URL without refreshing
          const url = new URL(window.location.href);
          url.searchParams.set('type', value);
          window.history.replaceState({}, '', url.toString());
        }}
      >
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="standard">
              {t('ws-invoices.standard_invoice')}
            </TabsTrigger>
            <TabsTrigger value="subscription">
              {t('ws-invoices.subscription_invoice')}
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="create-multiple-invoices"
                checked={createMultipleInvoices}
                onCheckedChange={handleCreateMultipleInvoicesChange}
              />
              <Label htmlFor="create-multiple-invoices">
                {t('ws-invoices.create_multiple_invoices')}
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="print-after-create"
                checked={printAfterCreate}
                onCheckedChange={handlePrintAfterCreateChange}
              />
              <Label htmlFor="print-after-create">
                {t('ws-invoices.print_after_create')}
              </Label>
            </div>
          </div>
        </div>

        <TabsContent value="standard" className="mt-4">
          <StandardInvoice
            wsId={wsId}
            defaultWalletId={defaultWalletId}
            createMultipleInvoices={createMultipleInvoices}
            printAfterCreate={printAfterCreate}
          />
        </TabsContent>
        <TabsContent value="subscription" className="mt-4">
          <SubscriptionInvoice
            wsId={wsId}
            defaultWalletId={defaultWalletId}
            createMultipleInvoices={createMultipleInvoices}
            printAfterCreate={printAfterCreate}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
