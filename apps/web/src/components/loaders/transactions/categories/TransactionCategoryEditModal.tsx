import { Timeline } from '@mantine/core';
import { useEffect, useState } from 'react';
import { CheckBadgeIcon, PlusIcon } from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import { useRouter } from 'next/router';
import { mutate } from 'swr';
import { TransactionCategory } from '../../../../types/primitives/TransactionCategory';
import { Status } from '../../status';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  wsId: string;
  category: TransactionCategory;
}

interface Progress {
  updated: Status;
}

const TransactionCategoryEditModal = ({ wsId, category }: Props) => {
  const router = useRouter();

  const { t } = useTranslation('category-modal');
  const success = t('common:success');
  const categoryUpdated = t('category-updated');

  const [progress, setProgress] = useState<Progress>({
    updated: 'idle',
  });

  const hasError = progress.updated === 'error';
  const hasSuccess = progress.updated === 'success';

  useEffect(() => {
    if (!hasSuccess) return;

    mutate(
      `/api/workspaces/${wsId}/finance/transactions/categories/${category.id}`
    );

    showNotification({
      title: success,
      message: categoryUpdated,
      color: 'green',
    });
  }, [hasSuccess, wsId, category.id, categoryUpdated, success]);

  const updateDetails = async () => {
    const res = await fetch(
      `/api/workspaces/${wsId}/finance/transactions/categories/${category.id}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(category),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({ ...progress, updated: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: t('common:error'),
        message: t('cannot-update-category'),
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, updated: 'error' }));
      return false;
    }
  };

  const handleEdit = async () => {
    if (!category.id) return;

    setProgress((progress) => ({ ...progress, updated: 'loading' }));
    updateDetails();
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={progress.updated === 'success' ? 1 : 0}
        bulletSize={32}
        lineWidth={4}
        color={started ? 'green' : 'gray'}
        className="mt-2"
      >
        <Timeline.Item
          bullet={<PlusIcon className="h-5 w-5" />}
          title={t('update-basic-info')}
        >
          {progress.updated === 'success' ? (
            <div className="text-green-300">{t('basic-info-updated')}</div>
          ) : progress.updated === 'error' ? (
            <div className="text-red-300">{t('cannot-update-basic-info')}</div>
          ) : progress.updated === 'loading' ? (
            <div className="text-blue-300">{t('updating-basic-info')}</div>
          ) : (
            <div className="text-zinc-400/80">
              {t('pending-basic-info-updated')}
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title={t('common:complete')}
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.updated === 'success' ? (
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

        {category.id && hasSuccess && (
          <button
            className="rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition hover:bg-blue-300/20"
            onClick={() => closeAllModals()}
          >
            {t('category-details')}
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
              router.push(`/${wsId}/finance/transactions/categories`);
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

export default TransactionCategoryEditModal;
