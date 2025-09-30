'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { StandardInvoice } from './standard-invoice';
import { SubscriptionInvoice } from './subscription-invoice';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { useState, useEffect } from 'react';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@tuturuuu/ui/tooltip';
import { Info } from '@tuturuuu/ui/icons';
import { useSearchParams } from 'next/navigation';

interface Props {
  wsId: string;
}

export default function NewInvoicePage({ wsId }: Props) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  
  // Read URL params for prefilling
  const urlUserId = searchParams.get('user_id') || '';
  const urlGroupId = searchParams.get('group_id') || '';
  const urlInvoiceType = searchParams.get('type') || 'subscription';
  const urlSelectedMonth = searchParams.get('month') || '';
  const urlAmount = searchParams.get('amount');
  const prefillAmount = urlAmount ? parseInt(urlAmount, 10) : undefined;
  
  const [selectedUserId, setSelectedUserId] = useState<string>(urlUserId);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(urlGroupId);
  const [selectedMonth, setSelectedMonth] = useState<string>(urlSelectedMonth);
  const [defaultTab, setDefaultTab] = useState<string>(urlInvoiceType);
  const [multipleInvoices, setMultipleInvoices] = useState<boolean>(false);
  const [printAfterCreate, setPrintAfterCreate] = useState<boolean>(false);
  
  // Update state when URL params change
  useEffect(() => {
    setSelectedUserId(urlUserId);
    setSelectedGroupId(urlGroupId);
    setSelectedMonth(urlSelectedMonth);
    setDefaultTab(urlInvoiceType);
  }, [urlUserId, urlGroupId, urlSelectedMonth, urlInvoiceType]);

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-invoices.new_invoice')}
        singularTitle={t('ws-invoices.new_invoice')}
      />
      <Separator className="my-4" />
      <Tabs defaultValue={defaultTab} className="w-full">
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
              <div className="space-y-1 flex items-center gap-2">
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
              <div className="space-y-1 flex items-center gap-2">
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
            selectedUserId={selectedUserId}
            onSelectedUserIdChange={setSelectedUserId}
            createMultipleInvoices={multipleInvoices}
            printAfterCreate={printAfterCreate}
          />
        </TabsContent>

        <TabsContent value="subscription" className="w-full">
          <SubscriptionInvoice
            wsId={wsId}
            selectedUserId={selectedUserId}
            onSelectedUserIdChange={setSelectedUserId}
            selectedGroupId={selectedGroupId}
            onSelectedGroupIdChange={setSelectedGroupId}
            selectedMonth={selectedMonth}
            onSelectedMonthChange={setSelectedMonth}
            prefillAmount={prefillAmount}
            createMultipleInvoices={multipleInvoices}
            printAfterCreate={printAfterCreate}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
