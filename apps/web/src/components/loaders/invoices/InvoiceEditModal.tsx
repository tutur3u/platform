import { Timeline } from '@mantine/core';
import { useEffect, useState } from 'react';
import {
  BanknotesIcon,
  CheckBadgeIcon,
  PlusIcon,
} from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import { useRouter } from 'next/router';
import { mutate } from 'swr';
import { Status } from '../status';
import { Invoice } from '../../../types/primitives/Invoice';
import { Product } from '../../../types/primitives/Product';
import { Transaction } from '../../../types/primitives/Transaction';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  wsId: string;

  transaction: Transaction;
  invoice: Invoice;

  oldProducts: Product[];
  products: Product[];
}

interface Progress {
  updateTransaction: Status;
  updateDetails: Status;
  updateProducts: Status;
  removeProducts: Status;
  addProducts: Status;
}

const EditModal = ({
  wsId,
  oldProducts,
  transaction,
  invoice,
  products,
}: Props) => {
  const { t } = useTranslation('invoice-modal');
  const success = t('success');
  const invoiceUpdated = t('invoice-updated');

  const router = useRouter();

  const [progress, setProgress] = useState<Progress>({
    updateTransaction: 'idle',
    updateDetails: 'idle',
    updateProducts: 'idle',
    removeProducts: 'idle',
    addProducts: 'idle',
  });

  const hasError =
    progress.updateTransaction === 'error' ||
    progress.updateDetails === 'error' ||
    progress.updateProducts === 'error' ||
    progress.removeProducts === 'error' ||
    progress.addProducts === 'error';

  const hasSuccess =
    progress.updateTransaction === 'success' &&
    progress.updateDetails === 'success' &&
    progress.updateProducts === 'success' &&
    progress.removeProducts === 'success' &&
    progress.addProducts === 'success';

  useEffect(() => {
    if (!hasSuccess) return;

    mutate(`/api/workspaces/${wsId}/finance/invoices/${invoice.id}`);
    mutate(`/api/invoices/${invoice.id}/products`);

    showNotification({
      title: success,
      message: invoiceUpdated,
      color: 'green',
    });
  }, [hasSuccess, wsId, invoice.id, invoiceUpdated, success]);

  const updateTransaction = async (transaction: Transaction) => {
    const res = await fetch(
      `/api/workspaces/${wsId}/finance/transactions/${transaction.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transaction),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({
        ...progress,
        updateTransaction: 'success',
      }));
      return true;
    } else {
      showNotification({
        title: t('common:error'),
        message: t('cannot-update-transaction'),
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, updateTransaction: 'error' }));
      return false;
    }
  };

  const updateDetails = async () => {
    const res = await fetch(
      `/api/workspaces/${wsId}/finance/invoices/${invoice.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(invoice),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({ ...progress, updateDetails: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: t('common:error'),
        message: t('cannot-update-invoice'),
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, updateDetails: 'error' }));
      return false;
    }
  };

  const updateProducts = async (products: Product[]) => {
    const updatePromises = products.map((product) => {
      return fetch(
        `/api/workspaces/${wsId}/finance/invoices/${invoice.id}/products/${product.id}?unitId=${product.unit_id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(product),
        }
      );
    });

    const res = await Promise.all(updatePromises);

    if (res.every((res) => res.ok)) {
      setProgress((progress) => ({ ...progress, updateProducts: 'success' }));
      return true;
    } else {
      showNotification({
        title: t('common:error'),
        message: t('cannot-update-products'),
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, updateProducts: 'error' }));
      return false;
    }
  };

  const removeProducts = async (products: Product[]) => {
    const removePromises = products.map((product) =>
      fetch(
        `/api/workspaces/${wsId}/finance/invoices/${invoice.id}/products/${product.id}?unitId=${product.unit_id}`,
        {
          method: 'DELETE',
        }
      )
    );

    const res = await Promise.all(removePromises);

    if (res.every((res) => res.ok)) {
      setProgress((progress) => ({ ...progress, removeProducts: 'success' }));
      return true;
    } else {
      showNotification({
        title: t('common:error'),
        message: t('cannot-remove-products'),
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, removeProducts: 'error' }));
      return false;
    }
  };

  const addProducts = async (products: Product[]) => {
    const res = await fetch(
      `/api/workspaces/${wsId}/finance/invoices/${invoice.id}/products`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ products }),
      }
    );

    if (res) {
      setProgress((progress) => ({ ...progress, addProducts: 'success' }));
      return true;
    } else {
      showNotification({
        title: t('common:error'),
        message: t('cannot-add-products'),
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, addProducts: 'error' }));
      return false;
    }
  };

  const productsToUpdate = products.filter((product) =>
    oldProducts.find(
      (oldProduct) =>
        product.id === oldProduct.id && product.unit_id === oldProduct.unit_id
    )
  );

  const productsToRemove = oldProducts.filter(
    (oldProduct) =>
      !products.find(
        (product) =>
          product.id === oldProduct.id && product.unit_id === oldProduct.unit_id
      )
  );

  const productsToAdd = products.filter(
    (product) =>
      !oldProducts.find(
        (oldProduct) =>
          product.id === oldProduct.id && product.unit_id === oldProduct.unit_id
      )
  );

  const handleEdit = async () => {
    if (!invoice.id) return;

    setProgress((progress) => ({ ...progress, updateTransaction: 'loading' }));
    if (!(await updateTransaction(transaction))) return;

    setProgress((progress) => ({ ...progress, updateDetails: 'loading' }));
    await updateDetails();

    mutate(`/api/workspaces/${wsId}/finance/invoices/${invoice.id}`);

    setProgress((progress) => ({ ...progress, updateProducts: 'loading' }));
    if (productsToUpdate.length) await updateProducts(productsToUpdate);
    else
      setProgress((progress) => ({ ...progress, updateProducts: 'success' }));

    setProgress((progress) => ({ ...progress, removeProducts: 'loading' }));
    if (productsToRemove.length) await removeProducts(productsToRemove);
    else
      setProgress((progress) => ({ ...progress, removeProducts: 'success' }));

    setProgress((progress) => ({ ...progress, addProducts: 'loading' }));
    if (productsToAdd.length) await addProducts(productsToAdd);
    else setProgress((progress) => ({ ...progress, addProducts: 'success' }));

    mutate(`/api/workspaces/${wsId}/finance/invoices/${invoice.id}/products`);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.addProducts === 'success'
            ? 5
            : progress.removeProducts === 'success'
            ? 4
            : progress.updateProducts === 'success'
            ? 3
            : progress.updateDetails === 'success'
            ? 2
            : progress.updateTransaction === 'success'
            ? 1
            : 0
        }
        bulletSize={32}
        lineWidth={4}
        color={started ? 'green' : 'gray'}
        className="mt-2"
      >
        <Timeline.Item
          bullet={<PlusIcon className="h-5 w-5" />}
          title={`${t('update')} ${t('transaction')}`}
        >
          {progress.updateTransaction === 'success' ? (
            <div className="text-green-300">{t('transaction-updated')}</div>
          ) : progress.updateTransaction === 'error' ? (
            <div className="text-red-300">{t('cannot-update-transaction')}</div>
          ) : progress.updateTransaction === 'loading' ? (
            <div className="text-blue-300">{t('updating-transaction')}</div>
          ) : (
            <div className="text-zinc-400/80">
              {t('pending-transaction-updated')}
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<PlusIcon className="h-5 w-5" />}
          title={`${t('update')} ${t('basic-info')}`}
        >
          {progress.updateDetails === 'success' ? (
            <div className="text-green-300">{t('basic-info-updated')}</div>
          ) : progress.updateDetails === 'error' ? (
            <div className="text-red-300">{t('cannot-update-basic-info')}</div>
          ) : progress.updateDetails === 'loading' ? (
            <div className="text-blue-300">{t('updating-basic-info')}</div>
          ) : (
            <div className="text-zinc-400/80">
              {t('pending-basic-info-updated')}
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`${t('update')} ${t('product')} (${
            productsToUpdate?.length || 0
          })`}
        >
          {progress.updateProducts === 'success' ? (
            <div className="text-green-300">
              {t('updated')} {productsToUpdate.length} {t('product')}
            </div>
          ) : progress.updateProducts === 'error' ? (
            <div className="text-red-300">
              {t('cannot-update')} {t('product')}
            </div>
          ) : progress.updateProducts === 'loading' ? (
            <div className="text-blue-300">
              {t('updating')} {productsToUpdate.length} {t('product')}
            </div>
          ) : (
            <div className="text-zinc-400/80">
              {t('pending-product-updated')}
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`${t('remove')} ${t('product')} (${
            productsToRemove?.length || 0
          })`}
        >
          {progress.removeProducts === 'success' ? (
            <div className="text-green-300">
              {t('removed')} {productsToRemove.length} {t('product')}
            </div>
          ) : progress.removeProducts === 'error' ? (
            <div className="text-red-300">
              {t('cannot-remove')} {t('product')}
            </div>
          ) : progress.removeProducts === 'loading' ? (
            <div className="text-blue-300">
              {t('removing')} {productsToRemove.length} {t('product')}
            </div>
          ) : (
            <div className="text-zinc-400/80">
              {t('pending-product-removed')}
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`${t('add')} ${t('product')} (${productsToAdd?.length || 0})`}
        >
          {progress.addProducts === 'success' ? (
            <div className="text-green-300">
              {t('added')} {productsToAdd.length} {t('product')}
            </div>
          ) : progress.addProducts === 'error' ? (
            <div className="text-red-300">
              {t('cannot-add')} {t('product')}
            </div>
          ) : progress.addProducts === 'loading' ? (
            <div className="text-blue-300">
              {t('adding')} {productsToAdd.length} {t('product')}
            </div>
          ) : (
            <div className="text-zinc-400/80">{t('pending-product-added')}</div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title={t('common:complete')}
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.addProducts === 'success' ? (
            <div className="text-green-300">{t('common:completed')}</div>
          ) : hasError ? (
            <div className="text-red-300">{t('common:cancel-completed')}</div>
          ) : (
            <div className="text-zinc-400/80">{t('common:pending-completion')}</div>
          )}
        </Timeline.Item>
      </Timeline>

      <div className="mt-4 flex justify-end gap-2">
        {started || (
          <button
            className="rounded border border-zinc-300/10 bg-zinc-300/10 px-4 py-1 font-semibold text-zinc-300 transition hover:bg-zinc-300/20"
            onClick={() => closeAllModals()}
          >
            {t('cancel')}
          </button>
        )}

        {invoice.id && hasSuccess && (
          <button
            className="rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition hover:bg-blue-300/20"
            onClick={() => closeAllModals()}
          >
            {t('invoice-details')}
          </button>
        )}

        <button
          className={`rounded border px-4 py-1 font-semibold transition ${
            hasError
              ? 'border-red-300/10 bg-red-300/10 text-red-300 hover:bg-red-300/20'
              : hasSuccess
              ? 'border-green-300/10 bg-green-300/10 text-green-300 hover:bg-green-300/20'
              : started
              ? 'cursor-not-allowed border-zinc-300/10 bg-zinc-300/10 text-zinc-300/50'
              : 'border-blue-300/10 bg-blue-300/10 text-blue-300 hover:bg-blue-300/20'
          }`}
          onClick={() => {
            if (hasError) {
              closeAllModals();
              return;
            }

            if (hasSuccess) {
              router.push(`/${wsId}/finance/invoices`);
              closeAllModals();
              return;
            }

            if (!started) {
              setStarted(true);
              handleEdit();
            }
          }}
        >
          {hasError
            ? t('common:return')
            : hasSuccess
            ? t('common:complete')
            : started
            ? t('common:creating')
            : t('common:start')}
        </button>
      </div>
    </>
  );
};

export default EditModal;
