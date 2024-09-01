import { createClient } from '@/utils/supabase/server';
import FeatureSummary from '@repo/ui/components/ui/custom/feature-summary';
import { Separator } from '@repo/ui/components/ui/separator';
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
  params: {
    wsId: string;
    invoiceId: string;
    locale: string;
  };
}

export default async function InvoiceDetailsPage({
  params: { invoiceId, locale },
}: Props) {
  const t = await getTranslations();
  const [invoice, products, promotions] = await Promise.all([
    getInvoice(invoiceId),
    getProducts(invoiceId),
    getPromotions(invoiceId),
  ]);

  if (!invoice) notFound();

  return (
    <div className="flex min-h-full w-full flex-col">
      <FeatureSummary
        pluralTitle={t('ws-invoices.plural')}
        singularTitle={t('ws-invoices.singular')}
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
              icon={<ShoppingCart className="h-5 w-5" />}
              label={t('invoices.products')}
              value={products.length}
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
          </div>

          <div className="h-full rounded-lg border p-4"></div>
        </div>

        <div className="grid gap-4">
          <div className="h-full rounded-lg border p-4">
            <div className="grid h-full content-start gap-2">
              <div className="text-lg font-semibold">
                {t('invoices.notice')}
              </div>
              <Separator />
              <p>{invoice.notice || t('common.empty')}</p>
            </div>
          </div>
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
          <div className="h-full rounded-lg border p-4">
            <div className="grid h-full content-start gap-2">
              <div className="text-lg font-semibold">{t('invoices.note')}</div>
              <Separator />
              <p>{invoice.note || t('common.empty')}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
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
  const supabase = createClient();

  const { data: invoice, error: invoiceError } = await supabase
    .from('finance_invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();

  if (invoiceError) throw invoiceError;

  return invoice;
}

async function getProducts(invoiceId: string) {
  const supabase = createClient();

  const { data: products, error: productsError } = await supabase
    .from('finance_invoice_products')
    .select('amount, price, product_name, product_unit, warehouse')
    .eq('invoice_id', invoiceId);

  if (productsError) throw productsError;

  return products;
}

async function getPromotions(invoiceId: string) {
  const supabase = createClient();

  const { data: promotions, error: promotionsError } = await supabase
    .from('finance_invoice_promotions')
    .select('code, name, use_ratio, value')
    .eq('invoice_id', invoiceId);

  if (promotionsError) throw promotionsError;

  return promotions;
}
