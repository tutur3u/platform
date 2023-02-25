import { ReactElement, useEffect, useState } from 'react';
import useSWR from 'swr';
import WalletTab from '../../components/finance/wallets/WalletTab';
import HeaderX from '../../components/metadata/HeaderX';
import { DEV_MODE } from '../../constants/common';
import { useAppearance } from '../../hooks/useAppearance';
import { useUserData } from '../../hooks/useUserData';
import { useUserList } from '../../hooks/useUserList';
import { PageWithLayoutProps } from '../../types/PageWithLayoutProps';
import { Wallet } from '../../types/primitives/Wallet';
import WalletEditForm from '../../components/forms/WalletEditForm';
import { openModal } from '@mantine/modals';
import { Transaction } from '../../types/primitives/Transaction';
import { useWallets } from '../../hooks/useWallets';
import { useProjects } from '../../hooks/useProjects';
import { Divider, Select } from '@mantine/core';
import NestedLayout from '../../components/layouts/NestedLayout';
import TransactionEditForm from '../../components/forms/TransactionEditForm';
import { useTransactions } from '../../hooks/useTransactions';
import TransactionTab from '../../components/finance/transactions/TransactionTab';
import { PlusIcon } from '@heroicons/react/24/solid';

const FinancePage: PageWithLayoutProps = () => {
  const { setRootSegment, changeLeftSidebarSecondaryPref } = useAppearance();
  const { updateUsers } = useUserList();
  const { data } = useUserData();

  const { wsId, projects, isProjectsLoading } = useProjects();

  const { data: workspace, error: workspaceError } = useSWR(
    wsId ? `/api/workspaces/${wsId}` : null
  );

  useEffect(() => {
    setRootSegment(
      wsId
        ? [
            {
              content: workspace?.name || 'Unnamed Workspace',
              href: `/workspaces/${wsId}`,
            },
            { content: 'Finance', href: `/finance` },
          ]
        : []
    );
  }, [wsId, workspace?.name, setRootSegment]);

  useEffect(() => {
    if (data) updateUsers([data]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const { createWallet, updateWallet, deleteWallet } = useWallets();
  const { createTransaction, updateTransaction, deleteTransaction } =
    useTransactions();

  const [projectId, setProjectId] = useState<string | null>();

  useEffect(() => {
    if (projects?.length) setProjectId(projects[0].id);
  }, [projects]);

  const [walletId, setWalletId] = useState<string | null>();
  const [wallet, setWallet] = useState<Wallet>();

  const { data: wallets, error: walletsError } = useSWR<Wallet[] | null>(
    projectId ? `/api/projects/${projectId}/wallets` : null
  );

  const isWalletsLoading = !wallets && !walletsError;

  const { data: transactions, error: transactionsError } = useSWR<
    Transaction[] | null
  >(
    projectId && walletId
      ? `/api/projects/${projectId}/wallets/${walletId}/transactions`
      : null
  );

  const isTransactionsLoading = !transactions && !transactionsError;

  useEffect(() => {
    if (walletId) {
      const wallet = wallets?.find((wallet) => wallet.id === walletId);
      if (wallet) setWallet(wallet);
    }
  }, [walletId, wallets]);

  const showEditWalletModal = (wallet?: Wallet) => {
    if (!projectId) return;

    openModal({
      title: (
        <div className="font-semibold">
          {wallet ? 'Edit wallet' : 'Create wallet'}
        </div>
      ),
      centered: true,
      children: (
        <WalletEditForm
          projectId={projectId || ''}
          wallet={wallet}
          onSubmit={wallet ? updateWallet : createWallet}
          onDelete={wallet ? () => deleteWallet(projectId, wallet) : undefined}
        />
      ),
    });
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
          projectId={projectId || ''}
          walletId={walletId || ''}
          transaction={transaction}
          onSubmit={transaction ? updateTransaction : createTransaction}
          onDelete={
            transaction
              ? () => deleteTransaction(projectId, walletId, transaction)
              : undefined
          }
        />
      ),
    });
  };

  return (
    <div className="flex h-full w-full flex-col gap-4 md:flex-row">
      <div className="flex flex-col gap-2 md:h-full md:w-72">
        <Select
          label="Project"
          placeholder="Select project"
          data={
            projects
              ? projects.map((project) => ({
                  label: project.name,
                  value: project.id,
                }))
              : []
          }
          value={projectId as string | undefined}
          onChange={(pid) => {
            setProjectId(pid);
            setWalletId(null);
          }}
        />

        {projectId && (
          <button
            onClick={() => showEditWalletModal()}
            className="w-full rounded border border-zinc-800 bg-zinc-800/80 p-2 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-300/10 hover:text-zinc-200"
          >
            Create wallet
          </button>
        )}

        <Divider className="my-1 w-full" />

        <Select
          label="Wallet"
          placeholder="Select wallet"
          data={
            wallets
              ? wallets.map((wallet) => ({
                  label: wallet.name,
                  value: wallet.id,
                }))
              : []
          }
          value={walletId as string | undefined}
          onChange={(wid) => {
            setWalletId(wid);
          }}
          className="md:hidden"
        />

        <Divider variant="dashed" className="my-1 w-full md:hidden" />

        <div className="scrollbar-none hidden flex-col gap-4 overflow-y-scroll md:flex">
          {wallets &&
            wallets.map((wallet) => (
              <WalletTab
                key={wallet.id}
                wallet={wallet}
                onClick={() => setWalletId(wallet.id)}
              />
            ))}
        </div>
      </div>

      {walletId ? (
        <div className="flex h-full w-full flex-col gap-4 rounded-lg border-zinc-800 md:border md:p-4">
          <div className="hidden rounded-lg bg-zinc-900 p-4 md:block">
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

          <Divider className="hidden w-full md:block" />

          <div className="flex w-full justify-between">
            <button
              onClick={() => showEditTransactionModal()}
              className="flex items-center justify-center gap-2 rounded border border-zinc-800 bg-zinc-800/80 p-2 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-300/10 hover:text-zinc-200"
            >
              Add transaction
            </button>
            {wallet && (
              <button
                onClick={() => showEditWalletModal(wallet)}
                className="flex items-center justify-center gap-2 rounded border border-zinc-800 bg-zinc-800/80 p-2 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-300/10 hover:text-zinc-200"
              >
                Edit wallet
              </button>
            )}
          </div>

          <div className="grid max-h-full gap-4 overflow-y-auto md:grid-cols-2 md:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
            {transactions &&
              transactions.map((transaction) => (
                <TransactionTab
                  key={transaction.id}
                  transaction={transaction}
                  onClick={() => showEditTransactionModal(transaction)}
                />
              ))}
          </div>
        </div>
      ) : (
        <div className="flex w-full items-center justify-center rounded-lg border border-zinc-800 p-4 md:p-8">
          <div className="text-center font-semibold text-zinc-500 md:text-2xl">
            Select a wallet to view transactions.
          </div>
        </div>
      )}
    </div>
  );
};

FinancePage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="document">{page}</NestedLayout>;
};

export default FinancePage;
