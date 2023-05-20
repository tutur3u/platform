import { ReactElement, useEffect, useState } from 'react';
import HeaderX from '../../../../components/metadata/HeaderX';
import { PageWithLayoutProps } from '../../../../types/PageWithLayoutProps';
import { enforceHasWorkspaces } from '../../../../utils/serverless/enforce-has-workspaces';
import NestedLayout from '../../../../components/layouts/NestedLayout';
import { Divider, NumberInput, Textarea } from '@mantine/core';
import { openModal } from '@mantine/modals';
import WorkspaceUserSelector from '../../../../components/selectors/WorkspaceUserSelector';
import { Product } from '../../../../types/primitives/Product';
import 'dayjs/locale/vi';
import InvoiceProductInput from '../../../../components/inputs/InvoiceProductInput';
import { useRouter } from 'next/router';
import useSWR, { mutate } from 'swr';
import { Invoice } from '../../../../types/primitives/Invoice';
import InvoiceEditModal from '../../../../components/loaders/invoices/InvoiceEditModal';
import InvoiceDeleteModal from '../../../../components/loaders/invoices/InvoiceDeleteModal';
import { useSegments } from '../../../../hooks/useSegments';
import { useWorkspaces } from '../../../../hooks/useWorkspaces';
import { DateTimePicker } from '@mantine/dates';
import useTranslation from 'next-translate/useTranslation';
import moment from 'moment';
import { Transaction } from '../../../../types/primitives/Transaction';
import WalletSelector from '../../../../components/selectors/WalletSelector';
import TransactionCategorySelector from '../../../../components/selectors/TransactionCategorySelector';
import { Wallet } from '../../../../types/primitives/Wallet';
import { TransactionCategory } from '../../../../types/primitives/TransactionCategory';

export const getServerSideProps = enforceHasWorkspaces;

const DetailsPage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  const router = useRouter();
  const { wsId, invoiceId } = router.query;

  const { t } = useTranslation('invoices');
  const unnamedWorkspace = t('unnamed-ws');
  const invoices = t('invoices');
  const loading = t('common:loading');
  const checkup = t('checkup');

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

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || unnamedWorkspace,
              href: `/${ws.id}`,
            },
            { content: checkup, href: `/${ws.id}/finance` },
            {
              content: invoices,
              href: `/${ws.id}/finance/invoices`,
            },
            {
              content: invoice?.id || loading,
              href: `/${ws.id}/finance/invoices/${invoice?.id}`,
            },
          ]
        : []
    );

    return () => setRootSegment([]);
  }, [
    ws,
    invoice,
    setRootSegment,
    unnamedWorkspace,
    invoices,
    loading,
    checkup,
  ]);

  const [walletId, setWalletId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [category, setCategory] = useState<TransactionCategory | null>(null);

  const [userId, setUserId] = useState<string>('');
  const [takenAt, setTakenAt] = useState<Date | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [diff, setDiff] = useState<number>(0);

  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (invoice) {
      setUserId(invoice?.customer_id || '');
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
    products?.every(
      (product) =>
        (product?.id?.length || 0) > 0 &&
        product?.unit_id &&
        product?.amount &&
        product?.price !== undefined
    );

  const hasRequiredFields = () =>
    products && products?.length > 0 && allProductsValid();

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

  const amount = (products || []).reduce(
    (acc, product) => acc + (product?.amount || 0),
    0
  );

  const price = (products || []).reduce(
    (acc, product) => acc + (product?.price || 0) * (product?.amount || 0),
    0
  );

  const showEditModal = () => {
    if (!invoice) return;
    if (typeof invoiceId !== 'string') return;
    if (!ws?.id) return;
    if (!productPrices || !products || !transaction) return;
    if (!walletId || !categoryId || !takenAt) return;

    openModal({
      title: <div className="font-semibold">{t('update-invoice')}</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <InvoiceEditModal
          wsId={ws.id}
          invoice={{
            id: invoiceId,
            customer_id: userId,
            notice: notice || '',
            note: note || '',
            total_diff: diff,
            price,
            completed_at: invoice.completed_at,
          }}
          transaction={{
            id: transaction.id,
            wallet_id: walletId,
            category_id: categoryId,
            taken_at: takenAt.toISOString(),
          }}
          oldProducts={productPrices}
          products={products}
        />
      ),
    });
  };

  const showDeleteModal = () => {
    if (!invoice) return;
    if (typeof invoiceId !== 'string') return;
    if (!ws?.id || !productPrices) return;

    openModal({
      title: <div className="font-semibold">{t('delete-invoice')}</div>,
      centered: true,
      closeOnEscape: false,
      closeOnClickOutside: false,
      withCloseButton: false,
      children: (
        <InvoiceDeleteModal
          wsId={ws.id}
          invoiceId={invoiceId}
          products={productPrices}
        />
      ),
    });
  };

  const toggleStatus = async () => {
    if (!invoice) return;
    if (typeof invoiceId !== 'string') return;
    if (!ws?.id) return;

    try {
      const res = await fetch(
        `/api/workspaces/${ws.id}/finance/invoices/${invoiceId}/status`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ completed: !completed }),
        }
      );

      if (res.ok) {
        mutate(`/api/workspaces/${ws.id}/invoices/${invoiceId}`);
        setCompleted((completed) => !completed);
      }
    } catch (err) {
      console.log(err);
    }
  };

  const { lang } = useTranslation();

  if (!ws) return null;

  return (
    <>
      <HeaderX label={`${t('invoices')} - ${t('finance')}`} />
      <div className="mt-2 flex min-h-full w-full flex-col ">
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
                invoice
                  ? 'hover:bg-red-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={invoice ? showDeleteModal : undefined}
            >
              {t('common:delete')}
            </button>

            <button
              className={`rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition ${
                hasRequiredFields()
                  ? 'hover:bg-blue-300/20'
                  : 'cursor-not-allowed opacity-50'
              }`}
              onClick={hasRequiredFields() ? showEditModal : undefined}
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

            <WorkspaceUserSelector
              userId={userId}
              setUserId={setUserId}
              className="col-span-full"
              required
            />

            <DateTimePicker
              value={takenAt}
              label={t('time')}
              onChange={(date) => setTakenAt(date || new Date())}
              className="col-span-full"
              classNames={{
                input: 'dark:bg-[#25262b]',
              }}
              valueFormat="HH:mm - dddd, DD/MM/YYYY"
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
                className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-2 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20 md:col-span-2"
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
                className="rounded border border-blue-500/10 bg-blue-500/10 px-4 py-2 font-semibold text-blue-600 transition hover:bg-blue-500/20 dark:border-blue-300/10 dark:bg-blue-300/10 dark:text-blue-300 dark:hover:bg-blue-300/20 md:col-span-2"
                onClick={() => setNote('')}
              >
                + {t('add-note')}
              </button>
            )}

            <Divider className="col-span-full my-2" />

            <WalletSelector
              walletId={walletId}
              wallet={wallet}
              setWallet={(w) => {
                setWallet(w);
                setWalletId(w?.id || '');
              }}
              className="col-span-full"
              disabled={!transaction?.wallet_id}
              preventPreselected
              hideBalance
              required
            />

            <TransactionCategorySelector
              categoryId={categoryId}
              category={category}
              setCategory={(c) => {
                setCategory(c);
                setCategoryId(c?.id || '');
              }}
              className="col-span-full"
              isExpense={false}
              preventPreselected
              required
              disabled={!transaction?.category_id}
            />

            {products && products?.length > 0 && (
              <div className="col-span-full">
                <NumberInput
                  label={t('total')}
                  placeholder={t('total-placeholder')}
                  value={price + (diff || 0)}
                  onChange={(e) => setDiff((e || 0) - price)}
                  classNames={{
                    input: 'bg-white/5 border-zinc-300/20 font-semibold',
                  }}
                  parser={(value) => value?.replace(/\$\s?|(,*)/g, '') || ''}
                  formatter={(value) =>
                    !Number.isNaN(parseFloat(value || ''))
                      ? (value || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                      : ''
                  }
                />

                {diff != 0 && (
                  <>
                    <button
                      className="mt-2 w-full rounded border border-red-300/10 bg-red-300/10 px-4 py-2 font-semibold text-red-300 transition hover:bg-red-300/20 md:col-span-2"
                      onClick={() => setDiff(0)}
                    >
                      {t('reorder')}
                    </button>
                    <Divider className="my-2" />
                    <div className="my-2 rounded border border-orange-300/10 bg-orange-300/10 p-2 text-center font-semibold text-orange-300">
                      {diff > 0 ? t('extra-pay') : t('discount')}{' '}
                      <span className="text-orange-100 underline decoration-orange-100 underline-offset-4">
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
                {products && products?.length > 0 && (
                  <>
                    (
                    <span className="text-blue-300">
                      x
                      {Intl.NumberFormat('vi-VN', {
                        style: 'decimal',
                      }).format(products?.length || 0)}{' '}
                    </span>{' '}
                    {amount != 0 && (
                      <>
                        |{' '}
                        <span className="text-purple-300">
                          x
                          {Intl.NumberFormat('vi-VN', {
                            style: 'decimal',
                          }).format(amount)}
                        </span>{' '}
                      </>
                    )}
                    |{' '}
                    <span className="text-green-300">
                      {Intl.NumberFormat('vi-VN', {
                        style: 'currency',
                        currency: 'VND',
                      }).format(price)}
                    </span>
                    {diff != null && diff != 0 && (
                      <>
                        {diff > 0 ? ' + ' : ' - '}{' '}
                        <span className="text-red-300">
                          {Intl.NumberFormat('vi-VN', {
                            style: 'currency',
                            currency: 'VND',
                          }).format(Math.abs(diff))}
                        </span>
                        {' = '}
                        <span className="text-yellow-300">
                          {Intl.NumberFormat('vi-VN', {
                            style: 'currency',
                            currency: 'VND',
                          }).format(
                            products.reduce(
                              (a, b) => a + (b?.amount || 0) * (b?.price || 0),
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

            {products && (
              <div className="mt-4 grid gap-4">
                {products.map((p, idx) => (
                  <InvoiceProductInput
                    key={p.id + idx}
                    wsId={ws.id}
                    product={p}
                    isLast={idx === products.length - 1}
                    getUniqueWarehouseIds={getUniqueWarehouseIds}
                    removePrice={() => removePrice(idx)}
                    updateProduct={(product) => updateProduct(idx, product)}
                    hideStock
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

DetailsPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default DetailsPage;
