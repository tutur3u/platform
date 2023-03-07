import { useRouter } from 'next/router';
import React, { ReactElement, useEffect } from 'react';
import useSWR from 'swr';
import { Divider } from '@mantine/core';
import { PencilIcon, PlusIcon } from '@heroicons/react/24/solid';
import { openModal } from '@mantine/modals';
import { useAppearance } from '../../../../../hooks/useAppearance';
import { Wallet } from '../../../../../types/primitives/Wallet';
import { useWallets } from '../../../../../hooks/useWallets';
import WalletEditForm from '../../../../../components/forms/WalletEditForm';
import HeaderX from '../../../../../components/metadata/HeaderX';
import NestedLayout from '../../../../../components/layouts/NestedLayout';
import TransactionEditForm from '../../../../../components/forms/TransactionEditForm';
import { Transaction } from '../../../../../types/primitives/Transaction';
import { useTransactions } from '../../../../../hooks/useTransactions';
import TransactionTab from '../../../../../components/finance/transactions/TransactionTab';

const WalletDetailPage = () => {
  const router = useRouter();
  const { projectId, walletId } = router.query;
  const { createWallet, updateWallet, deleteWallet } = useWallets();
  const { createTransaction, updateTransaction, deleteTransaction } =
    useTransactions();

  const { data: project } = useSWR(
    projectId ? `/api/projects/${projectId}` : null
  );

  const { data: wallet } = useSWR<Wallet>(
    walletId ? `/api/projects/${projectId}/wallets/${walletId}` : null
  );

  const { data: transactions } = useSWR<Transaction[] | null>(
    projectId && walletId
      ? `/api/projects/${projectId}/wallets/${walletId}/transactions`
      : null
  );

  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(
      project?.workspaces?.id
        ? [
            {
              content: project?.workspaces?.name || 'Unnamed Workspace',
              href: `/workspaces/${project.workspaces.id}`,
            },
            {
              content: 'Projects',
              href: `/workspaces/${project?.workspaces?.id}/projects`,
            },
            {
              content: project?.name || 'Untitled Project',
              href: `/projects/${projectId}`,
            },
            { content: 'Finance', href: `/projects/${projectId}/finance` },
            {
              content: wallet
                ? wallet?.name || 'Untitled Wallet'
                : 'Loading...',
              href: `/projects/${projectId}/finance/${walletId}`,
            },
          ]
        : []
    );
  }, [projectId, walletId, project, wallet, setRootSegment]);

  const showEditWalletModal = (wallet?: Wallet) => {
    openModal({
      title: (
        <div className="font-semibold">
          {wallet ? 'Edit wallet' : 'Create wallet'}
        </div>
      ),
      centered: true,
      children: (
        <WalletEditForm
          projectId={(projectId || '') as string}
          wallet={wallet}
          onSubmit={wallet ? updateWallet : createWallet}
          onDelete={
            wallet
              ? () => handleDeleteWallet(projectId as string, wallet)
              : undefined
          }
        />
      ),
    });
  };

  const handleDeleteWallet = (projectId: string, wallet: Wallet) => {
    if (!projectId || !walletId) return;

    deleteWallet(projectId, wallet);
    router.push(`/projects/${projectId}/finance`);
  };

  const showEditTransactionModal = (transaction?: Transaction) => {
    if (!projectId || !walletId) return;

    openModal({
      title: (
        <div className="font-semibold">
          {transaction ? 'Edit transaction' : 'Create transaction'}
        </div>
      ),
      centered: true,
      children: (
        <TransactionEditForm
          projectId={(projectId || '') as string}
          walletId={(walletId || '') as string}
          transaction={transaction}
          onSubmit={transaction ? updateTransaction : createTransaction}
          onDelete={
            transaction
              ? () =>
                  deleteTransaction(
                    projectId as string,
                    walletId as string,
                    transaction
                  )
              : undefined
          }
        />
      ),
    });
  };

  return (
    <>
      <HeaderX label={`Finance – ${project?.name || 'Untitled Project'}`} />

      {projectId && (
        <>
          <div className="rounded-lg bg-zinc-900 p-4">
            <h1 className="text-2xl font-bold">
              {wallet?.name || 'Untitled Wallet'}
            </h1>
            <p className="text-xl text-zinc-400">
              {Intl.NumberFormat('vi-VN', {
                style: 'currency',
                currency: 'VND',
              }).format(wallet?.balance || 0)}
            </p>
          </div>
        </>
      )}

      <Divider className="my-4" />
      {wallet && (
        <div className="mb-5 flex items-center justify-between">
          <button
            onClick={() => showEditTransactionModal()}
            className="flex items-center gap-1 rounded bg-blue-300/20 px-4 py-2 font-semibold text-blue-300 transition hover:bg-blue-300/10"
          >
            Add transaction <PlusIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => showEditWalletModal(wallet)}
            className="flex items-center gap-1 rounded bg-blue-300/20 px-4 py-2 font-semibold text-blue-300 transition hover:bg-blue-300/10"
          >
            Edit wallet <PencilIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-5 md:grid-cols-1 md:gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {transactions &&
          transactions.map((transaction) => (
            <TransactionTab
              key={transaction.id}
              transaction={transaction}
              onClick={() => showEditTransactionModal(transaction)}
            />
          ))}
      </div>
    </>
  );
};

WalletDetailPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="document">{page}</NestedLayout>;
};

export default WalletDetailPage;
