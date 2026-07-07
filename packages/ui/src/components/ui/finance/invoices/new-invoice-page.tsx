'use client';

import { ChevronDown } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Separator } from '@tuturuuu/ui/separator';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { Switch } from '@tuturuuu/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { resolveSupportedCurrency } from '@tuturuuu/utils/currencies';
import { useTranslations } from 'next-intl';
import { useQueryState } from 'nuqs';
import { useState } from 'react';
import { useLocalStorage } from '../../../../hooks/use-local-storage';
import { useWorkspaceConfigs } from '../../../../hooks/use-workspace-config';
import {
  type FinancePermissionRequestUser,
  FinancePermissionWarningDialog,
} from '../shared/finance-permission-warning-dialog';
import { StandardInvoice } from './standard-invoice';
import { SubscriptionInvoice } from './subscription-invoice';

const INVOICE_DEFAULT_CONFIG_IDS = [
  'default_wallet_id',
  'default_category_id',
  'DEFAULT_SUBSCRIPTION_CATEGORY_ID',
  'DEFAULT_CURRENCY',
] as const;

interface Props {
  wsId: string;
  canCreateInvoices?: boolean;
  canChangeFinanceWallets?: boolean;
  canSetFinanceWalletsOnCreate?: boolean;
  canReadInvoiceProducts?: boolean;
  canReadInvoiceProductStock?: boolean;
  canReadGroupLinkedProducts?: boolean;
  defaultCurrency?: string;
  initialDefaultCategoryId?: string | null;
  initialDefaultSubscriptionCategoryId?: string | null;
  initialDefaultWalletId?: string | null;
  permissionRequestUser?: FinancePermissionRequestUser | null;
  workspaceTimezone?: string | null;
}

export default function NewInvoicePage({
  wsId,
  canCreateInvoices = true,
  canChangeFinanceWallets = true,
  canSetFinanceWalletsOnCreate = true,
  canReadInvoiceProducts = true,
  canReadInvoiceProductStock = true,
  canReadGroupLinkedProducts = true,
  defaultCurrency: workspaceDefaultCurrency,
  initialDefaultCategoryId,
  initialDefaultSubscriptionCategoryId,
  initialDefaultWalletId,
  permissionRequestUser,
  workspaceTimezone,
}: Props) {
  const t = useTranslations();
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [invoiceType, setInvoiceType] = useQueryState('type', {
    defaultValue: 'standard',
    parse: (value) => (value === 'subscription' ? 'subscription' : 'standard'),
    serialize: (value) => value,
  });

  const [prefillAmount] = useQueryState('amount', {
    parse: (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    },
  });

  const { data: refreshedDefaultConfigs = {} } = useWorkspaceConfigs(
    wsId,
    INVOICE_DEFAULT_CONFIG_IDS
  );
  const defaultConfigs = {
    DEFAULT_CURRENCY: workspaceDefaultCurrency ?? null,
    DEFAULT_SUBSCRIPTION_CATEGORY_ID:
      initialDefaultSubscriptionCategoryId ?? null,
    default_category_id: initialDefaultCategoryId ?? null,
    default_wallet_id: initialDefaultWalletId ?? null,
    ...refreshedDefaultConfigs,
  };
  const defaultWalletId = defaultConfigs.default_wallet_id ?? undefined;
  const defaultTransactionCategoryId =
    defaultConfigs.default_category_id ?? undefined;
  const defaultSubscriptionCategoryId =
    defaultConfigs.DEFAULT_SUBSCRIPTION_CATEGORY_ID ?? undefined;
  const defaultCategoryId =
    defaultSubscriptionCategoryId ?? defaultTransactionCategoryId;
  const defaultCurrency = resolveSupportedCurrency(
    defaultConfigs.DEFAULT_CURRENCY,
    resolveSupportedCurrency(workspaceDefaultCurrency)
  );

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

  const pageHeader = (
    <>
      <FeatureSummary
        pluralTitle={t('ws-invoices.new_invoice')}
        singularTitle={t('ws-invoices.new_invoice')}
      />
      <Separator className="my-4" />
    </>
  );

  if (!canCreateInvoices) {
    return (
      <>
        {pageHeader}
        <FinancePermissionWarningDialog
          defaultOpen
          missingPermissions={['create_invoices']}
          user={permissionRequestUser}
          trigger={
            <Button variant="outline">
              {t('finance-permission-warning.open_request')}
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      {pageHeader}
      <Tabs
        value={invoiceType}
        className="w-full"
        onValueChange={(value) => setInvoiceType(value as any)}
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
              onCloseAutoFocus={(event: Event) => event.preventDefault()}
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
          {invoiceType === 'standard' ? (
            <StandardInvoice
              wsId={wsId}
              defaultWalletId={defaultWalletId}
              defaultCategoryId={defaultTransactionCategoryId}
              defaultCurrency={defaultCurrency}
              canChangeFinanceWallets={canChangeFinanceWallets}
              canSetFinanceWalletsOnCreate={canSetFinanceWalletsOnCreate}
              canReadInvoiceProducts={canReadInvoiceProducts}
              canReadInvoiceProductStock={canReadInvoiceProductStock}
              createMultipleInvoices={createMultipleInvoices}
              printAfterCreate={printAfterCreate}
              downloadImageAfterCreate={downloadImageAfterCreate}
              permissionRequestUser={permissionRequestUser}
            />
          ) : null}
        </TabsContent>
        <TabsContent value="subscription" className="mt-4">
          {invoiceType === 'subscription' ? (
            <SubscriptionInvoice
              wsId={wsId}
              prefillAmount={prefillAmount}
              defaultWalletId={defaultWalletId}
              defaultCategoryId={defaultCategoryId}
              defaultCurrency={defaultCurrency}
              workspaceTimezone={workspaceTimezone}
              canChangeFinanceWallets={canChangeFinanceWallets}
              canSetFinanceWalletsOnCreate={canSetFinanceWalletsOnCreate}
              canReadInvoiceProducts={canReadInvoiceProducts}
              canReadInvoiceProductStock={canReadInvoiceProductStock}
              canReadGroupLinkedProducts={canReadGroupLinkedProducts}
              createMultipleInvoices={createMultipleInvoices}
              printAfterCreate={printAfterCreate}
              downloadImageAfterCreate={downloadImageAfterCreate}
              permissionRequestUser={permissionRequestUser}
            />
          ) : null}
        </TabsContent>
      </Tabs>
    </>
  );
}
