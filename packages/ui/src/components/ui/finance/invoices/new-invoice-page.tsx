'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { StandardInvoice } from './standard-invoice';
import { SubscriptionInvoice } from './subscription-invoice';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { Separator } from '@tuturuuu/ui/separator';
import { useState } from 'react';

interface Props {
  wsId: string;
}

export default function NewInvoicePage({ wsId }: Props) {
  const t = useTranslations();
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  return (
    <>
        <FeatureSummary
        pluralTitle={t('ws-invoices.new_invoice')}
        singularTitle={t('ws-invoices.new_invoice')}
        />
      <Separator className="my-4" />
      <Tabs defaultValue="standard" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="standard">
            {t('ws-invoices.standard_invoice')}
          </TabsTrigger>
          <TabsTrigger value="subscription">
            {t('ws-invoices.subscription_invoice')}
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="standard" className="w-full">
          <StandardInvoice
            wsId={wsId}
            selectedUserId={selectedUserId}
            onSelectedUserIdChange={setSelectedUserId}
          />
        </TabsContent>
        
        <TabsContent value="subscription" className="w-full">
          <SubscriptionInvoice
            wsId={wsId}
            selectedUserId={selectedUserId}
            onSelectedUserIdChange={setSelectedUserId}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
