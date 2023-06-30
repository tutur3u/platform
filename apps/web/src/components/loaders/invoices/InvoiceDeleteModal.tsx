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
import { Status } from '../status';
import { mutate } from 'swr';
import { Product } from '../../../types/primitives/Product';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  wsId: string;
  invoiceId: string;
  products: Product[];
}

interface Progress {
  removeProducts: Status;
  remove: Status;
}

const InvoiceDeleteModal = ({ wsId, invoiceId, products }: Props) => {
  const router = useRouter();

  const { t } = useTranslation('invoice-modal');
  const success = t('common:success');
  const invoiceDeleted = t('invoice-deleted');

  const [progress, setProgress] = useState<Progress>({
    removeProducts: 'idle',
    remove: 'idle',
  });

  const hasError =
    progress.removeProducts === 'error' || progress.remove === 'error';

  const hasSuccess =
    progress.removeProducts === 'success' && progress.remove === 'success';

  useEffect(() => {
    if (!hasSuccess) return;

    showNotification({
      title: success,
      message: invoiceDeleted,
      color: 'green',
    });
  }, [hasSuccess, invoiceId, success, invoiceDeleted]);

  const removeProducts = async (products: Product[]) => {
    const removePromises = products.map((p) =>
      fetch(
        `/api/workspaces/${wsId}/finance/invoices/${invoiceId}/products/${p.id}?unitId=${p.unit_id}`,
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

  const remove = async () => {
    const res = await fetch(
      `/api/workspaces/${wsId}/finance/invoices/${invoiceId}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      setProgress((progress) => ({
        ...progress,
        remove: 'success',
      }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: t('common:error'),
        message: t('cannot-delete-invoice'),
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, remove: 'error' }));
      return false;
    }
  };

  const handleDelete = async () => {
    if (!invoiceId) return;

    setProgress((progress) => ({ ...progress, removeProducts: 'loading' }));
    if (products.length) await removeProducts(products);
    else
      setProgress((progress) => ({ ...progress, removeProducts: 'success' }));
    mutate(`/api/workspaces/${wsId}/finance/invoices/${invoiceId}/products`);

    setProgress((progress) => ({ ...progress, removeDetails: 'loading' }));
    await remove();
    mutate(`/api/workspaces/${wsId}/finance/invoices/${invoiceId}`);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.remove === 'success'
            ? 2
            : progress.removeProducts === 'success'
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
          title={`${t('remove')} ${t('product')} (${products?.length || 0})`}
        >
          {progress.removeProducts === 'success' ? (
            <div className="text-green-300">
              {t('removed')} {products?.length || 0} {t('product')}
            </div>
          ) : progress.removeProducts === 'error' ? (
            <div className="text-red-300">
              {t('cannot-remove')} {products?.length || 0} {t('product')}
            </div>
          ) : progress.removeProducts === 'loading' ? (
            <div className="text-blue-300">
              {t('removing')} {products?.length || 0} {t('product')}
            </div>
          ) : (
            <div className="text-zinc-400/80">
              {t('pending-to-remove')} {products?.length || 0} {t('product')}
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`${t('delete')} ${t('invoice')}`}
        >
          {progress.remove === 'success' ? (
            <div className="text-green-300">
              {t('deleted')} {t('invoice')}
            </div>
          ) : progress.remove === 'error' ? (
            <div className="text-red-300">
              {t('cannot-delete')} {t('invoice')}
            </div>
          ) : progress.remove === 'loading' ? (
            <div className="text-blue-300">
              {t('deleting')} {t('invoice')}
            </div>
          ) : (
            <div className="text-zinc-400/80">
              {t('pending-invoice-deleted')}
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title={t('common:complete')}
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.remove === 'success' ? (
            <div className="text-green-300">{t('common:completed')}</div>
          ) : hasError ? (
            <div className="text-red-300">{t('common:cancel-completed')}</div>
          ) : (
            <div className="text-zinc-400/80">
              {t('common:pending-completion')}
            </div>
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
              handleDelete();
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

export default InvoiceDeleteModal;
