import { Timeline } from '@mantine/core';
import { useState } from 'react';
import { BanknotesIcon, CheckBadgeIcon } from '@heroicons/react/24/solid';
import { showNotification } from '@mantine/notifications';
import { closeAllModals } from '@mantine/modals';
import { useRouter } from 'next/router';
import { Status } from '../status';
import { TransactionCategory } from '../../../types/primitives/TransactionCategory';
import { Wallet } from '../../../types/primitives/Wallet';
import { Transaction } from '../../../types/primitives/Transaction';
import useTranslation from 'next-translate/useTranslation';

interface Props {
  wsId: string;

  wallets: Wallet[];
  categories: TransactionCategory[];
  transactions: Transaction[];
}

interface Progress {
  createdWallets: Status;
  createdCategories: Status;
  createdTransactions: Status;
}

const FinanceImportModal = ({
  wsId,
  wallets,
  categories,
  transactions,
}: Props) => {
  const router = useRouter();

  const { t } = useTranslation('finance-import-modal');

  const [progress, setProgress] = useState<Progress>({
    createdWallets: 'idle',
    createdCategories: 'idle',
    createdTransactions: 'idle',
  });

  const hasError =
    progress.createdWallets === 'error' ||
    progress.createdCategories === 'error' ||
    progress.createdTransactions === 'error';

  const hasSuccess =
    progress.createdWallets === 'success' &&
    progress.createdCategories === 'success' &&
    progress.createdTransactions === 'success';

  const createWallets = async () => {
    if (wallets.length === 0) {
      setProgress((progress) => ({ ...progress, createdWallets: 'success' }));
      return [];
    }

    const res = await fetch(`/api/workspaces/${wsId}/finance/wallets/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ wallets }),
    });

    if (res.ok) {
      setProgress((progress) => ({ ...progress, createdWallets: 'success' }));
      return (await res.json()) as Wallet[];
    } else {
      showNotification({
        title: t('error'),
        message: t('error-message-wallet'),
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, createdWallets: 'error' }));
      return null;
    }
  };

  const createCategories = async () => {
    if (categories.length === 0) {
      setProgress((progress) => ({
        ...progress,
        createdCategories: 'success',
      }));
      return [];
    }

    const res = await fetch(
      `/api/workspaces/${wsId}/finance/transactions/categories/import`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ categories }),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({
        ...progress,
        createdCategories: 'success',
      }));
      return (await res.json()) as TransactionCategory[];
    } else {
      showNotification({
        title: t('error'),
        message: t('error-message-category'),
        color: 'red',
      });
      setProgress((progress) => ({ ...progress, createdCategories: 'error' }));
      return null;
    }
  };

  const createTransactions = async (
    newWallets: Wallet[],
    newCategories: TransactionCategory[]
  ) => {
    if (transactions.length === 0) {
      setProgress((progress) => ({
        ...progress,
        createdTransactions: 'success',
      }));
      return true;
    }

    const newTransactions: Transaction[] = transactions.map((transaction) => {
      const currentWallet = wallets.find(
        (wallet) => wallet.id === transaction.wallet_id
      );

      const currentCategory = categories.find(
        (category) => category.id === transaction.category_id
      );

      const newWallet = newWallets.find(
        (wallet) => wallet.name === currentWallet?.name
      );

      const newCategory = newCategories.find(
        (category) => category.name === currentCategory?.name
      );

      return {
        ...transaction,
        wallet_id: newWallet?.id,
        category_id: newCategory?.id,
      };
    });

    const res = await fetch(
      `/api/workspaces/${wsId}/finance/transactions/import`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transactions: newTransactions }),
      }
    );

    if (res.ok) {
      setProgress((progress) => ({
        ...progress,
        createdTransactions: 'success',
      }));
      return true;
    } else {
      showNotification({
        title: t('error'),
        message: t('error-message-transaction'),
        color: 'red',
      });
      setProgress((progress) => ({
        ...progress,
        createdTransactions: 'error',
      }));
      return false;
    }
  };

  const handleCreate = async () => {
    setProgress((progress) => ({ ...progress, createdWallets: 'loading' }));

    const newWallets = await createWallets();

    if (!newWallets) return;

    setProgress((progress) => ({
      ...progress,
      createdCategories: 'loading',
    }));

    const newCategories = await createCategories();

    if (!newCategories) return;

    setProgress((progress) => ({
      ...progress,
      createdTransactions: 'loading',
    }));

    await createTransactions(newWallets, newCategories);
  };

  const [started, setStarted] = useState(false);

  return (
    <>
      <Timeline
        active={
          progress.createdTransactions === 'success'
            ? 3
            : progress.createdCategories === 'success'
            ? 2
            : progress.createdWallets === 'success'
            ? 1
            : 0
        }
        bulletSize={32}
        lineWidth={4}
        color={started ? 'green' : 'gray'}
        className="mt-2"
      >
        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`${t('add')} ${t('wallets')} (${wallets?.length || 0})`}
        >
          {progress.createdWallets === 'success' ? (
            <div className="text-green-300">
              {t('added')} {wallets.length} {t('wallets')}
            </div>
          ) : progress.createdWallets === 'error' ? (
            <div className="text-red-300">
              {t('cannot-add')} {t('wallets')}
            </div>
          ) : progress.createdWallets === 'loading' ? (
            <div className="text-blue-300">
              {t('adding')} {wallets.length} {t('wallets')}
            </div>
          ) : (
            <div className="text-zinc-400/80">
              {t('pending')} {t('wallets')}
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`${t('add')} ${t('transaction-categories')} (${
            categories?.length || 0
          })`}
        >
          {progress.createdWallets === 'success' ? (
            progress.createdCategories === 'success' ? (
              <div className="text-green-300">
                {t('added')} {categories.length} {t('transaction-categories')}
              </div>
            ) : progress.createdCategories === 'error' ? (
              <div className="text-red-300">
                {t('cannot-add')} {t('transaction-categories')}
              </div>
            ) : progress.createdCategories === 'loading' ? (
              <div className="text-blue-300">
                {t('adding')} {categories.length} {t('transaction-categories')}
              </div>
            ) : (
              <div className="text-zinc-400/80">
                {t('pending')} {t('transaction-categories')}
              </div>
            )
          ) : progress.createdCategories === 'error' ? (
            <div className="text-red-300">
              {t('canceled')} {t('transaction-categories')}
            </div>
          ) : (
            <div className="text-zinc-400/80">
              {t('pending')} {t('transaction-categories')}
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          bullet={<BanknotesIcon className="h-5 w-5" />}
          title={`${t('add')} ${t('transactions')} (${
            transactions?.length || 0
          })`}
        >
          {progress.createdCategories === 'success' ? (
            progress.createdTransactions === 'success' ? (
              <div className="text-green-300">
                {t('added')} {transactions.length} {t('transactions')}
              </div>
            ) : progress.createdTransactions === 'error' ? (
              <div className="text-red-300">
                {t('cannot-add')} {t('transactions')}
              </div>
            ) : progress.createdTransactions === 'loading' ? (
              <div className="text-blue-300">
                {t('adding')} {transactions.length} {t('transactions')}
              </div>
            ) : (
              <div className="text-zinc-400/80">
                {t('pending')} {t('transactions')}
              </div>
            )
          ) : progress.createdTransactions === 'error' ? (
            <div className="text-red-300">
              {t('canceled')} {t('transactions')}
            </div>
          ) : (
            <div className="text-zinc-400/80">
              {t('pending')} {t('transactions')}
            </div>
          )}
        </Timeline.Item>

        <Timeline.Item
          title={t('complete')}
          bullet={<CheckBadgeIcon className="h-5 w-5" />}
          lineVariant="dashed"
        >
          {progress.createdTransactions === 'success' ? (
            <div className="text-green-300">{t('completed')}</div>
          ) : hasError ? (
            <div className="text-red-300">{t('cancel-completed')}</div>
          ) : (
            <div className="text-zinc-400/80">{t('pending-completion')}</div>
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
              router.push(`/${wsId}/finance`);
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
            ? t('return')
            : hasSuccess
            ? t('complete')
            : started
            ? t('creating')
            : t('start')}
        </button>
      </div>
    </>
  );
};

export default FinanceImportModal;
