import { Timeline } from '@mantine/core';
import { useEffect, useState } from 'react';
import { CheckBadgeIcon, PlusIcon } from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import { useRouter } from 'next/router';
import { Status } from '../../status';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  wsId: string;
  categoryId: string;
}

interface Progress {
  removed: Status;
}

const TransactionCategoryDeleteModal = ({ wsId, categoryId }: Props) => {
  const router = useRouter();

  const { t } = useTranslation('category-modal');
  const success = t('common:success');
  const categoryDeleted = t('category-deleted');

  const [progress, setProgress] = useState<Progress>({
    removed: 'idle',
  });

  const hasError = progress.removed === 'error';
  const hasSuccess = progress.removed === 'success';

  useEffect(() => {
    if (!hasSuccess) return;

    showNotification({
      title: success,
      message: categoryDeleted,
      color: 'green',
    });
  }, [hasSuccess, categoryId, success, categoryDeleted]);

  const removeDetails = async () => {
    const res = await fetch(
      `/api/workspaces/${wsId}/finance/transactions/categories/${categoryId}`,
      {
        method: 'DELETE',
      }
    );

    if (res.ok) {
      setProgress((progress) => ({ ...progress, removed: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: t('common:error'),
        message: t('cannot-delete-category'),
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, removed: 'error' }));
      return false;
    }
  };

  const handleDelete = async () => {
    if (!categoryId) return;

    setProgress((progress) => ({ ...progress, removed: 'loading' }));
    removeDetails();
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={progress.removed === 'success' ? 1 : 0}
        bulletSize={32}
        lineWidth={4}
        color={started ? 'green' : 'gray'}
        className="mt-2"
      >
        <Timeline.Item
          bullet={<PlusIcon className="h-5 w-5" />}
          title={t('delete-category')}
        >
          {progress.removed === 'success' ? (
            <div className="text-green-300">{t('category-deleted')}</div>
          ) : progress.removed === 'error' ? (
            <div className="text-red-300">{t('cannot-delete-category')}</div>
          ) : progress.removed === 'loading' ? (
            <div className="text-blue-300">{t('deleting-category')}</div>
          ) : (
            <div className="text-zinc-400/80">
              {t('pending-category-deleted')}
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title={t('common:complete')}
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.removed === 'success' ? (
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
              router.push(`/${wsId}/finance/categories/categories`);
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

export default TransactionCategoryDeleteModal;
