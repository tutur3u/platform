'use client';

import { ChevronDown } from '@tuturuuu/icons';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { useLocalStorage } from '@tuturuuu/ui/hooks/use-local-storage';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Separator } from '@tuturuuu/ui/separator';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { StandardInvoice } from './standard-invoice';
import { SubscriptionInvoice } from './subscription-invoice';

interface Props {
  wsId: string;
  defaultWalletId?: string;
}

export default function NewInvoicePage({ wsId, defaultWalletId }: Props) {
  const t = useTranslations();
  const searchParams = useSearchParams();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [
    createMultipleInvoices,
    setCreateMultipleInvoices,
    createMultipleInvoicesInitialized,
  ] = useLocalStorage('createMultipleInvoices', false);
  const [printAfterCreate, setPrintAfterCreate, printAfterCreateInitialized] =
    useLocalStorage('printAfterCreate', true);
  const [
    downloadImageAfterCreate,
    setDownloadImageAfterCreate,
    downloadImageAfterCreateInitialized,
  ] = useLocalStorage('downloadImageAfterCreate', false);

  const isInitialized =
    createMultipleInvoicesInitialized &&
    printAfterCreateInitialized &&
    downloadImageAfterCreateInitialized;

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

          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                {t('ws-invoices.options')}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              {isInitialized ? (
                <div className="flex flex-col gap-3 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-1 flex-col gap-1">
                      <span className="font-medium text-sm">
                        {t('ws-invoices.create_multiple_invoices')}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {t('ws-invoices.create_multiple_invoices_tooltip')}
                      </span>
                    </div>
                    <Switch
                      id="create-multiple-invoices"
                      checked={createMultipleInvoices}
                      onCheckedChange={setCreateMultipleInvoices}
                      disabled={printAfterCreate || downloadImageAfterCreate}
                    />
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-1 flex-col gap-1">
                      <span className="font-medium text-sm">
                        {t('ws-invoices.print_after_create')}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {t('ws-invoices.print_after_create_tooltip')}
                      </span>
                    </div>
                    <Switch
                      id="print-after-create"
                      checked={printAfterCreate}
                      onCheckedChange={setPrintAfterCreate}
                      disabled={createMultipleInvoices}
                    />
                  </div>
                  <div className="h-px bg-border" />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-1 flex-col gap-1">
                      <span className="font-medium text-sm">
                        {t('ws-invoices.download_image_after_create')}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {t('ws-invoices.download_image_after_create_tooltip')}
                      </span>
                    </div>
                    <Switch
                      id="download-image-after-create"
                      checked={downloadImageAfterCreate}
                      onCheckedChange={setDownloadImageAfterCreate}
                      disabled={createMultipleInvoices}
                    />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 px-2 py-1.5">
                  <Skeleton className="h-6 w-32 rounded" />
                  <Skeleton className="h-6 w-32 rounded" />
                  <Skeleton className="h-6 w-32 rounded" />
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <TabsContent value="standard" className="mt-4">
          <StandardInvoice
            wsId={wsId}
            defaultWalletId={defaultWalletId}
            createMultipleInvoices={createMultipleInvoices}
            printAfterCreate={printAfterCreate}
            downloadImageAfterCreate={downloadImageAfterCreate}
          />
        </TabsContent>
        <TabsContent value="subscription" className="mt-4">
          <SubscriptionInvoice
            wsId={wsId}
            defaultWalletId={defaultWalletId}
            createMultipleInvoices={createMultipleInvoices}
            printAfterCreate={printAfterCreate}
            downloadImageAfterCreate={downloadImageAfterCreate}
          />
        </TabsContent>
      </Tabs>
    </>
  );
}
