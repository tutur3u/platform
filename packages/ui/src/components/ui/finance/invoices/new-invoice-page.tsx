'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { StandardInvoice } from './standard-invoice';
import { SubscriptionInvoice } from './subscription-invoice';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { useState } from 'react';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@tuturuuu/ui/tooltip';
import { Info } from '@tuturuuu/ui/icons';

interface Props {
  wsId: string;
}

export default function NewInvoicePage({ wsId }: Props) {
  const t = useTranslations();
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [multipleInvoices, setMultipleInvoices] = useState<boolean>(false);

  return (
    <>
      <FeatureSummary
        pluralTitle={t('ws-invoices.new_invoice')}
        singularTitle={t('ws-invoices.new_invoice')}
      />
      <Separator className="my-4" />
      <Tabs defaultValue="subscription" className="w-full">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="standard">
              {t('ws-invoices.standard_invoice')}
            </TabsTrigger>
            <TabsTrigger value="subscription">
              {t('ws-invoices.subscription_invoice')}
            </TabsTrigger>
          </TabsList>
          <div className="flex items-center justify-center gap-2">
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
              onCheckedChange={setMultipleInvoices}
            />
          </div>
        </div>

        <TabsContent value="standard" className="w-full">
          <StandardInvoice
            wsId={wsId}
            selectedUserId={selectedUserId}
            onSelectedUserIdChange={setSelectedUserId}
            createMultipleInvoices={multipleInvoices}
          />
        </TabsContent>

        <TabsContent value="subscription" className="w-full">
          <SubscriptionInvoice
            wsId={wsId}
            selectedUserId={selectedUserId}
            onSelectedUserIdChange={setSelectedUserId}
            createMultipleInvoices={multipleInvoices}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
