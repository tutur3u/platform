'use client';

import InvoiceProductInput from '../../../../../../../components/inputs/InvoiceProductInput';
import { Invoice } from '@/types/primitives/Invoice';
import { Product } from '@/types/primitives/Product';
import { Transaction } from '@/types/primitives/Transaction';
import { Divider, NumberInput, Textarea } from '@mantine/core';
import { DateTimePicker } from '@mantine/dates';
import 'dayjs/locale/vi';
import moment from 'moment';
import useTranslation from 'next-translate/useTranslation';
import { useEffect, useState } from 'react';
import useSWR, { mutate } from 'swr';

interface Props {
  params: {
    wsId: string;
    invoiceId: string;
  };
}

export default function InvoiceDetailsPage({
  params: { wsId, invoiceId },
}: Props) {
  const { t } = useTranslation('invoices');

  const apiPath =
    wsId && invoiceId
      ? `/api/workspaces/${wsId}/finance/invoices/${invoiceId}`
      : null;

  const productsApiPath =
    wsId && invoiceId
      ? `/api/workspaces/${wsId}/finance/invoices/${invoiceId}/products`
      : null;

  const { data: invoice } = useSWR<Invoice>(apiPath);
  const { data: productPrices } = useSWR<Product[]>(productsApiPath);

  const transactionApiPath =
    wsId && invoice?.transaction_id
      ? `/api/workspaces/${wsId}/finance/transactions/${invoice?.transaction_id}`
      : null;

  const { data: transaction } = useSWR<Transaction>(transactionApiPath);

  const [walletId, setWalletId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const [takenAt, setTakenAt] = useState<Date | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [diff, setDiff] = useState<number>(0);

  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (invoice) {
      setNotice(invoice?.notice || '');
      setNote(invoice?.note || '');
      setDiff(invoice?.total_diff || 0);
      setCompleted(!!invoice?.completed_at || false);
    }
  }, [invoice]);

  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (productPrices) setProducts(productPrices);
  }, [productPrices]);

  useEffect(() => {
    if (!transaction) return;

    if (transaction?.taken_at)
      setTakenAt(moment(transaction?.taken_at).toDate());

    if (transaction?.wallet_id) setWalletId(transaction?.wallet_id);
    if (transaction?.category_id) setCategoryId(transaction?.category_id);
  }, [transaction]);

  const allProductsValid = () =>
    products.every(
      (product) =>
        product?.id?.length > 0 &&
        product?.unit_id &&
        product?.amount &&
        product?.price !== undefined
    );

  const hasRequiredFields = () =>
    products.length > 0 && allProductsValid() && walletId && categoryId;

  const addEmptyProduct = () => {
    if (!products) return;
    setProducts((products) => [
      ...(products || []),
      {
        id: '',
        amount: 1,
      },
    ]);
  };

  const getUniqueWarehouseIds = () => {
    const ids = new Set<string>();
    (products || []).forEach((product) =>
      ids.add(`${product.id}::${product.unit_id}`)
    );
    return Array.from(ids);
  };

  const removePrice = (index: number) =>
    setProducts((products) => (products || []).filter((_, i) => i !== index));

  const updateProduct = (index: number, product: Product) =>
    setProducts((products) =>
      products.map((p, i) => (i === index ? product : p))
    );

  const amount = products.reduce(
    (acc, product) => acc + (product?.amount ? Number(product?.amount) : 0),
    0
  );

  const price = products.reduce(
    (acc, product) =>
      acc +
      (product?.price ? Number(product?.price) : 0) *
        (product?.amount ? Number(product?.amount) : 0),
    0
  );

  const toggleStatus = async () => {
    if (!invoice) return;
    if (!wsId) return;

    try {
      const res = await fetch(
        `/api/workspaces/${wsId}/finance/invoices/${invoiceId}/status`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ completed: !completed }),
        }
      );

      if (res.ok) {
        await mutate(`/api/workspaces/${wsId}/invoices/${invoiceId}`);
        setCompleted((completed) => !completed);
      }
    } catch (error) {
      console.log(error);
    }
  };

  const { lang } = useTranslation();

  return (
    <div className="mt-2 flex min-h-full w-full flex-col">
      <div className="grid gap-x-8 gap-y-4 xl:grid-cols-2 xl:gap-x-16">
        <button
          className={`w-fit rounded border px-4 py-1 font-semibold transition ${
            hasRequiredFields()
              ? completed
                ? 'border-zinc-300/10 bg-zinc-300/10 text-zinc-300 hover:bg-zinc-300/20'
                : 'border-green-300/10 bg-green-300/10 text-green-300 hover:bg-green-300/20'
              : 'cursor-not-allowed border-zinc-300/20 opacity-50'
          }`}
          onClick={hasRequiredFields() ? toggleStatus : undefined}
        >
          {completed ? t('reopen-invoice') : t('close-invoice')}
        </button>

        <div className="flex items-end justify-end gap-2">
          <button
            className={`rounded border border-red-300/10 bg-red-300/10 px-4 py-1 font-semibold text-red-300 transition ${
              invoice ? 'hover:bg-red-300/20' : 'cursor-not-allowed opacity-50'
            }`}
          >
            {t('common:delete')}
          </button>

          <button
            className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
              hasRequiredFields()
                ? 'hover:bg-blue-300/20'
                : 'cursor-not-allowed opacity-50'
            }`}
          >
            {t('save-changes')}
          </button>
        </div>
      </div>

      <Divider className="my-4" />
      <div className="grid gap-x-8 gap-y-4 xl:grid-cols-4 xl:gap-x-16">
        <div className="grid h-fit gap-x-4 gap-y-2 md:grid-cols-2">
          <div className="col-span-full">
            <div className="text-2xl font-semibold">{t('basic-info')}</div>
            <Divider className="my-2" variant="dashed" />
          </div>

          <DateTimePicker
            value={takenAt}
            label={t('time')}
            onChange={(date) => setTakenAt(date || new Date())}
            className="col-span-full"
            classNames={{
              input: 'dark:bg-[#25262b]',
            }}
            valueFormat="HH:mm - dddd, DD/MM/YYYY"
            placeholder={'Date & time'}
            locale={lang}
            disabled={!transaction?.taken_at}
          />

          <Divider className="col-span-full my-2" />

          {notice != null ? (
            <Textarea
              label={t('notice')}
              placeholder={t('notice-placeholder')}
              value={notice}
              onChange={(e) => setNotice(e.currentTarget.value)}
              className="md:col-span-2"
              minRows={5}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
            />
          ) : (
            <button
              className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-2 font-semibold text-blue-600 transition hover:bg-blue-500/20 md:col-span-2 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20"
              onClick={() => setNotice('')}
            >
              + {t('add-notice')}
            </button>
          )}

          {note != null ? (
            <Textarea
              label={t('note')}
              placeholder={t('note-placeholder')}
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
              className="md:col-span-2"
              minRows={5}
              classNames={{
                input: 'bg-white/5 border-zinc-300/20 font-semibold',
              }}
            />
          ) : (
            <button
              className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-2 font-semibold text-blue-600 transition hover:bg-blue-500/20 md:col-span-2 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20"
              onClick={() => setNote('')}
            >
              + {t('add-note')}
            </button>
          )}

          <Divider className="col-span-full my-2" />

          {products?.length > 0 && (
            <div className="col-span-full">
              <NumberInput
                label={t('total')}
                placeholder={t('total-placeholder')}
                value={price + (diff || 0)}
                onChange={(e) => setDiff((e ? Number(e) : 0) - price)}
              />

              {diff != 0 && (
                <>
                  <button
                    className="mt-2 w-full rounded border border-red-500/10 bg-red-500/10 px-4 py-2 font-semibold text-red-600 transition hover:bg-red-500/20 md:col-span-2 dark:border-red-300/10 dark:bg-red-300/10 dark:text-red-300 dark:hover:bg-red-300/20"
                    onClick={() => setDiff(0)}
                  >
                    {t('reset')}
                  </button>
                  <Divider className="my-2" />
                  <div className="my-2 rounded border border-orange-500/10 bg-orange-500/10 p-2 text-center font-semibold text-orange-400 dark:border-orange-300/10 dark:bg-orange-300/10 dark:text-orange-300">
                    {diff > 0 ? t('extra-pay') : t('discount')}{' '}
                    <span className="text-orange-600 underline decoration-orange-600 underline-offset-4 dark:text-orange-100 dark:decoration-orange-100">
                      {Intl.NumberFormat('vi-VN', {
                        style: 'currency',
                        currency: 'VND',
                      }).format(Math.abs(diff))}
                    </span>{' '}
                    {t('for-this-invoice')}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="grid h-fit gap-x-4 gap-y-2 xl:col-span-3">
          <div className="col-span-full">
            <div className="text-2xl font-semibold">
              {t('products')}{' '}
              {products?.length > 0 && (
                <>
                  (
                  <span className="text-blue-600 dark:text-blue-300">
                    x
                    {Intl.NumberFormat('vi-VN', {
                      style: 'decimal',
                    }).format(products?.length || 0)}
                  </span>{' '}
                  {amount != 0 && (
                    <>
                      |{' '}
                      <span className="text-purple-600 dark:text-purple-300">
                        x
                        {Intl.NumberFormat('vi-VN', {
                          style: 'decimal',
                        }).format(amount)}
                      </span>{' '}
                    </>
                  )}
                  |{' '}
                  <span className="text-green-600 dark:text-green-300">
                    {Intl.NumberFormat('vi-VN', {
                      style: 'currency',
                      currency: 'VND',
                    }).format(price)}
                  </span>
                  {diff != null && diff != 0 && (
                    <>
                      {diff > 0 ? ' + ' : ' - '}{' '}
                      <span className="text-red-600 dark:text-red-300">
                        {Intl.NumberFormat('vi-VN', {
                          style: 'currency',
                          currency: 'VND',
                        }).format(Math.abs(diff))}
                      </span>
                      {' = '}
                      <span className="text-yellow-600 dark:text-yellow-300">
                        {Intl.NumberFormat('vi-VN', {
                          style: 'currency',
                          currency: 'VND',
                        }).format(
                          products.reduce(
                            (a, b) =>
                              a +
                              (b?.amount ? Number(b.amount) : 0) *
                                (b?.price ? Number(b.price) : 0),
                            0
                          ) + (diff || 0)
                        )}
                      </span>
                    </>
                  )}
                  )
                </>
              )}
            </div>
            <Divider className="mb-4 mt-2" variant="dashed" />

            <button
              className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-1 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20"
              onClick={addEmptyProduct}
            >
              + {t('add-product')}
            </button>
          </div>

          <div className="mt-4 grid gap-4">
            {products.map((p, idx) => (
              <InvoiceProductInput
                key={p.id + idx}
                wsId={wsId}
                product={p}
                isLast={idx === products.length - 1}
                getUniqueWarehouseIds={getUniqueWarehouseIds}
                removePrice={() => removePrice(idx)}
                updateProduct={(product) => updateProduct(idx, product)}
                hideStock
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
