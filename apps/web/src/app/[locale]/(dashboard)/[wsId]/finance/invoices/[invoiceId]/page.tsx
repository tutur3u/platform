import InvoiceCard from './invoice-card';
import { availableConfigs } from '@/constants/configs/reports';
import { createClient } from '@tutur3u/supabase/next/server';
import { WorkspaceConfig } from '@tutur3u/types/primitives/WorkspaceConfig';
import FeatureSummary from '@tutur3u/ui/custom/feature-summary';
import { Separator } from '@tutur3u/ui/separator';
import 'dayjs/locale/vi';
import {
  Box,
  Calendar,
  DollarSign,
  FileText,
  Percent,
  ShoppingCart,
} from 'lucide-react';
import moment from 'moment';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

interface Props {
  params: Promise<{
    wsId: string;
    invoiceId: string;
    locale: string;
  }>;
}

export default async function InvoiceDetailsPage({ params }: Props) {
  const { wsId, invoiceId, locale } = await params;
  const t = await getTranslations();

  const invoice = await getInvoice(invoiceId);
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
            <div className="text-lg font-semibold">
              {t('invoices.basic-info')}
            </div>
            <Separator />
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
              value={products.reduce((acc, product) => acc + product.amount, 0)}
            />
          </div>

          <InvoiceCard
            lang={locale}
            configs={configs}
            invoice={invoice}
            products={products}
            promotions={promotions}
          />
        </div>

        <div className="flex h-full flex-col gap-4">
          <div className="grid h-fit gap-2 rounded-lg border p-4">
            <div className="text-lg font-semibold">
              {t('invoices.products')}
            </div>
            <Separator />
            {products.length > 0 ? (
              products.map((product, index) => (
                <DetailItem
                  key={index}
                  icon={<Box className="h-5 w-5" />}
                  label={`[${product.product_name}]`}
                  value={`${product.amount} ${product.product_unit} x ${Intl.NumberFormat(
                    locale,
                    {
                      style: 'currency',
                      currency: 'VND',
                    }
                  ).format(product.price)}`}
                />
              ))
            ) : (
              <p>{t('common.empty')}</p>
            )}
          </div>
          <div className="h-fit rounded-lg border p-4">
            <div className="grid h-full content-start gap-2">
              <div className="text-lg font-semibold">
                {t('workspace-inventory-tabs.promotions')}
              </div>
              <Separator />
              {promotions.length > 0 ? (
                promotions.map((promotion, index) => (
                  <DetailItem
                    key={index}
                    icon={<Percent className="h-5 w-5" />}
                    label={promotion.name || promotion.code}
                    value={`${
                      promotion.use_ratio
                        ? `${promotion.value}%`
                        : `-${Intl.NumberFormat(locale, {
                            style: 'currency',
                            currency: 'VND',
                          }).format(promotion.value)}`
                    }`}
                  />
                ))
              ) : (
                <p>{t('common.empty')}</p>
              )}
            </div>
          </div>
          <div className="h-fit rounded-lg border p-4">
            <div className="grid h-fit content-start gap-2">
              <div className="text-lg font-semibold">{t('invoices.note')}</div>
              <Separator />
              <p>{invoice.note || t('common.empty')}</p>
            </div>
          </div>
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

async function getInvoice(invoiceId: string) {
  const supabase = await createClient();

  const { data: invoice, error: invoiceError } = await supabase
    .from('finance_invoices')
    .select(
      '*, ...workspace_users!customer_id(customer_display_name:display_name, customer_full_name:full_name)'
    )
    .eq('id', invoiceId)
    .single();

  if (invoiceError) throw invoiceError;

  return invoice;
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
  let configs = [
    ...availableConfigs.map(({ defaultValue, ...rest }) => ({
      ...rest,
      value: defaultValue,
    })),
  ];

  // If rawData is not empty, merge it with availableConfigs
  if (rawData && rawData.length) {
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
