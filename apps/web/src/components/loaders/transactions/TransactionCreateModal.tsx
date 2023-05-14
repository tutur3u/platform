import { Timeline } from '@mantine/core';
import { useEffect, useState } from 'react';
import { CheckBadgeIcon, PlusIcon } from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Status } from '../status';
import { Transaction } from '../../../types/primitives/Transaction';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  wsId: string;
  walletId: string;
  transaction: Partial<Transaction>;
  redirectUrl?: string;
}

interface Progress {
  created: Status;
}

const TransactionCreateModal = ({
  wsId,
  walletId,
  transaction,
  redirectUrl,
}: Props) => {
  const router = useRouter();

  const { t } = useTranslation('transaction-modal');
  const success = t('common:success');
  const transactionCreated = t('transaction-created');

  const [progress, setProgress] = useState<Progress>({
    created: 'idle',
  });

  const hasError = progress.created === 'error';
  const hasSuccess = progress.created === 'success';

  useEffect(() => {
    if (hasSuccess)
      showNotification({
        title: success,
        message: transactionCreated,
        color: 'green',
      });
  }, [hasSuccess, success, transactionCreated]);

  const createTransaction = async (transaction: Transaction) => {
    const res = await fetch(
      `/api/workspaces/${wsId}/finance/wallets/${walletId}/transactions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transaction),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({ ...progress, created: 'success' }));
      const { id } = await res.json();
      return id;
    } else {
      showNotification({
        title: t('common:error'),
        message: t('cannot-create-transaction'),
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, created: 'error' }));
      return false;
    }
  };

  const [transactionId, setTransactionId] = useState<string | null>(null);

  const handleCreate = async () => {
    setProgress((progress) => ({ ...progress, created: 'loading' }));
    const transactionId = await createTransaction(transaction);
    if (transactionId) setTransactionId(transactionId);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={progress.created === 'success' ? 1 : 0}
        bulletSize={32}
        lineWidth={4}
        color={started ? 'green' : 'gray'}
        className="mt-2"
      >
        <Timeline.Item
          bullet={<PlusIcon className="h-5 w-5" />}
          title={t('create-transaction')}
        >
          {progress.created === 'success' ? (
            <div className="text-green-300">{t('transaction-created')}</div>
          ) : progress.created === 'error' ? (
            <div className="text-red-300">{t('cannot-create-transaction')}</div>
          ) : progress.created === 'loading' ? (
            <div className="text-blue-300">{t('creating-transaction')}</div>
          ) : (
            <div className="text-zinc-400/80">
              {t('pending-transaction-created')}
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title={t('common:complete')}
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.created === 'success' ? (
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

        {transactionId && (hasError || hasSuccess) && (
          <Link
            href={`/${wsId}/finance/transactions/${transactionId}`}
            onClick={() => closeAllModals()}
            className="rounded border border-blue-300/10 bg-blue-300/10 px-4 py-1 font-semibold text-blue-300 transition hover:bg-blue-300/20"
          >
            {t('transaction-details')}
          </Link>
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
              if (redirectUrl) router.push(redirectUrl);
              closeAllModals();
              return;
            }

            if (!started) {
              setStarted(true);
              handleCreate();
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

export default TransactionCreateModal;
