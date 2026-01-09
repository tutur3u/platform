import {
  Box,
  Calendar,
  DollarSign,
  FileText,
  Percent,
  ShoppingCart,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/server';
import type { WorkspaceConfig } from '@tuturuuu/types/primitives/WorkspaceConfig';
import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { ProductCard } from '@tuturuuu/ui/finance/invoices/invoiceId/product-card';
import { PromotionCard } from '@tuturuuu/ui/finance/invoices/invoiceId/promotion-card';
import { Separator } from '@tuturuuu/ui/separator';
import { availableConfigs } from '@tuturuuu/utils/configs/reports';
import 'dayjs/locale/vi';
import moment from 'moment';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import InvoiceCard from './invoice-card';
import InvoiceEditForm from './invoice-edit-form';

interface Props {
  wsId: string;
  locale: string;
  invoiceId: string;
  canUpdateInvoices?: boolean;
}

export default async function InvoiceDetailsPage({
  wsId,
  locale,
  invoiceId,
  canUpdateInvoices = false,
}: Props) {
  const t = await getTranslations();

  const invoice = await getInvoiceDetails(invoiceId);
  const products = await getProducts(invoiceId);
  const promotions = await getPromotions(invoiceId);
  const { data: configs } = await getConfigs(wsId);

  if (!invoice) notFound();

  return (
    <>
      <FeatureSummary
        pluralTitle={invoice.notice || t('ws-invoices.plural')}
        singularTitle={invoice.notice || t('ws-invoices.singular')}
        description={t('ws-invoices.description')}
        createTitle={t('ws-invoices.create')}
        createDescription={t('ws-invoices.create_description')}
      />
      <Separator className="my-4" />
      <div className="grid h-fit gap-4 md:grid-cols-2">
        <div className="flex h-full flex-col gap-4">
          <div className="grid h-fit gap-2 rounded-lg border p-4">
            <div className="font-semibold text-lg">
              {t('invoices.basic-info')}
            </div>
            <Separator />
            <div className="flex flex-col gap-2">
              <DetailItem
                icon={<FileText className="h-5 w-5" />}
                label={t('invoice-data-table.id')}
                value={invoice.id}
              />
              <DetailItem
                icon={<DollarSign className="h-5 w-5" />}
                label={t('invoice-data-table.final_price')}
                value={`${Intl.NumberFormat(locale, {
                  style: 'currency',
                  currency: 'VND',
                }).format(invoice.price)} + ${Intl.NumberFormat(locale, {
                  style: 'currency',
                  currency: 'VND',
                }).format(invoice.total_diff)} = ${Intl.NumberFormat(locale, {
                  style: 'currency',
                  currency: 'VND',
                }).format(invoice.price + invoice.total_diff)}`}
              />
              <DetailItem
                icon={<Calendar className="h-5 w-5" />}
                label={t('invoice-data-table.created_at')}
                value={
                  invoice.created_at
                    ? moment(invoice.created_at).format('DD/MM/YYYY, HH:mm:ss')
                    : '-'
                }
              />
              <DetailItem
                icon={<ShoppingCart className="h-5 w-5" />}
                label={t('invoices.products')}
                value={products.reduce(
                  (acc, product) => acc + product.amount,
                  0
                )}
              />
            </div>
          </div>

          <InvoiceCard
            lang={locale}
            configs={configs}
            invoice={{
              ...invoice,
              creator: invoice.creator ?? {
                display_name: null,
                full_name: null,
              },
            }}
            products={products}
            promotions={promotions}
          />
        </div>

        <div className="flex h-full flex-col gap-4">
          <div className="grid h-fit gap-2 rounded-lg border p-4">
            <div className="font-semibold text-lg">
              {t('invoices.products')}
            </div>
            <Separator />
            {products.length > 0 ? (
              <div className="flex flex-col gap-2">
                {products.map((product, index) => (
                  <ProductCard
                    key={index}
                    product={product}
                    locale={locale}
                    workspaceId={wsId}
                  />
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                <Box className="mx-auto mb-3 h-12 w-12 opacity-50" />
                <p>{t('common.empty')}</p>
              </div>
            )}
          </div>
          <div className="h-fit rounded-lg border p-4">
            <div className="grid h-full content-start gap-2">
              <div className="font-semibold text-lg">
                {t('workspace-inventory-tabs.promotions')}
              </div>
              <Separator />
              {promotions.length > 0 ? (
                <div className="space-y-3">
                  {promotions.map((promotion, index) => (
                    <PromotionCard
                      key={index}
                      promotion={promotion}
                      locale={locale}
                    />
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-muted-foreground">
                  <Percent className="mx-auto mb-3 h-12 w-12 opacity-50" />
                  <p>{t('common.empty')}</p>
                </div>
              )}
            </div>
          </div>
          {canUpdateInvoices && (
            <InvoiceEditForm
              wsId={wsId}
              invoiceId={invoice.id}
              initialNotice={invoice.notice}
              initialNote={invoice.note}
              initialWalletId={invoice.wallet_id}
            />
          )}
        </div>
      </div>
    </>
  );
}

function DetailItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  if (!value) return undefined;
  return (
    <div className="flex items-center gap-1">
      {icon}
      <span className="font-semibold">{label}:</span> {value}
    </div>
  );
}

async function getInvoiceDetails(invoiceId: string) {
  const supabase = await createClient();

  // Fetch invoice with both platform and workspace user data in a single query
  const { data: invoice, error: invoiceError } = await supabase
    .from('finance_invoices')
    .select(
      `*,
      ...workspace_users!customer_id(customer_display_name:display_name, customer_full_name:full_name),
      legacy_creator:workspace_users!creator_id(display_name, full_name),
      platform_creator:users!platform_creator_id(display_name, user_private_details(full_name, email)),
      wallet:workspace_wallets(name)`
    )
    .eq('id', invoiceId)
    .single();

  if (invoiceError) throw invoiceError;

  // Extract platform and legacy creator data
  const platformCreator = invoice.platform_creator as {
    display_name: string | null;
    user_private_details: {
      full_name: string | null;
      email: string | null;
    } | null;
  } | null;

  const legacyCreator = invoice.legacy_creator as {
    display_name: string | null;
    full_name: string | null;
  } | null;

  // Merge creator data, prioritizing platform user data
  const creator = {
    display_name:
      platformCreator?.display_name ??
      legacyCreator?.display_name ??
      platformCreator?.user_private_details?.email ??
      null,
    full_name:
      platformCreator?.user_private_details?.full_name ??
      legacyCreator?.full_name ??
      null,
  };

  // Return invoice with merged creator data
  return {
    ...invoice,
    creator,
    // Remove the intermediate fields to keep the response clean
    legacy_creator: undefined,
    platform_creator: undefined,
  };
}

async function getProducts(invoiceId: string) {
  const supabase = await createClient();

  const { data: products, error: productsError } = await supabase
    .from('finance_invoice_products')
    .select('*')
    .eq('invoice_id', invoiceId);

  if (productsError) throw productsError;

  return products;
}

async function getPromotions(invoiceId: string) {
  const supabase = await createClient();

  const { data: promotions, error: promotionsError } = await supabase
    .from('finance_invoice_promotions')
    .select('*')
    .eq('invoice_id', invoiceId);

  if (promotionsError) throw promotionsError;

  return promotions;
}

async function getConfigs(wsId: string) {
  const supabase = await createClient();

  const queryBuilder = supabase
    .from('workspace_configs')
    .select('*')
    .eq('ws_id', wsId)
    .order('created_at', { ascending: false });

  queryBuilder.in(
    'id',
    availableConfigs
      .map(({ id }) => id)
      .filter((id): id is string => id !== undefined)
  );

  const { data: rawData, error } = await queryBuilder;
  if (error) throw error;

  // Create a copy of availableConfigs to include in the response
  const configs = [
    ...availableConfigs.map(({ defaultValue, ...rest }) => ({
      ...rest,
      value: defaultValue,
    })),
  ];

  // If rawData is not empty, merge it with availableConfigs
  if (rawData?.length) {
    rawData.forEach((config) => {
      const index = configs.findIndex((c) => c.id === config.id);
      if (index !== -1) {
        // Replace the default config with the one from the database
        configs[index] = { ...configs[index], ...config };
      } else {
        // If the config does not exist in availableConfigs, add it
        configs.push(config);
      }
    });
  }

  const count = configs.length;

  return { data: configs, count } as {
    data: WorkspaceConfig[];
    count: number;
  };
}
