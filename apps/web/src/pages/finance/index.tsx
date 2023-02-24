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
import { Select } from '@mantine/core';
import SidebarLayout from '../../components/layouts/SidebarLayout';
import TransactionEditForm from '../../components/forms/TransactionEditForm';
import { useTransactions } from '../../hooks/useTransactions';
import TransactionTab from '../../components/finance/transactions/TransactionTab';
import { PlusIcon} from '@heroicons/react/24/solid';

const FinancePage: PageWithLayoutProps = () => {
  const { setRootSegment, changeLeftSidebarSecondaryPref } = useAppearance();
  const { updateUsers } = useUserList();
  const { data } = useUserData();

  useEffect(() => {
    changeLeftSidebarSecondaryPref('hidden');
    setRootSegment({
      content: 'Finance',
      href: '/finance',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (data) updateUsers([data]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const { createWallet, updateWallet, deleteWallet } = useWallets();
  const { projects, isProjectsLoading } = useProjects();
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
    <>
      <div className="tablet:flex w-full">
        <div className="tablet:border-r tablet:h-screen flex h-fit w-72 flex-col gap-5 border-zinc-800 p-5">
          <div className="flex flex-col gap-3">
            <Select
              label="Select project"
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
            <div className="tablet:hidden flex items-end justify-between">
              <Select
                label="Select wallet"
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
                className="w-[80%]"
              />

              <button
                className="rounded-md bg-zinc-800 p-2 text-zinc-500 transition hover:text-zinc-400"
                onClick={() => showEditWalletModal()}
              >
                <PlusIcon className="w-5" />
              </button>
            </div>
          </div>

          <button
            onClick={() => showEditWalletModal()}
            className="tablet:block hidden w-full rounded border border-zinc-800 bg-zinc-800/80 p-2 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-300/10 hover:text-zinc-200"
          >
            Create wallet
          </button>

          <div className="scrollbar-none tablet:flex hidden flex-col gap-5 overflow-y-scroll">
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
          <div className="w-full p-5">
            <div className="mb-6 rounded-lg bg-zinc-900 p-4">
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

            <div className="flex w-full justify-between">
              <button
                onClick={() => showEditTransactionModal()}
                className="mb-6 flex items-center justify-center gap-2 rounded border border-zinc-800 bg-zinc-800/80 p-2 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-300/10 hover:text-zinc-200"
              >
                Add transaction
              </button>
              {wallet && (
                <button
                  onClick={() => showEditWalletModal(wallet)}
                  className="mb-7 flex items-center justify-center gap-2 rounded border border-zinc-800 bg-zinc-800/80 p-2 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-300/10 hover:text-zinc-200"
                >
                  Edit wallet
                </button>
              )}
            </div>

            <div className="tablet:grid-cols-2 grid grid-cols-1 gap-6 lg:grid-cols-3 xl:grid-cols-4">
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
          <div className="flex w-full items-center justify-center p-4 md:p-8">
            <div className="text-2xl font-semibold text-zinc-500">
              Select a wallet to view transactions.
            </div>
          </div>
        )}
      </div>
    </>
  );
};

FinancePage.getLayout = function getLayout(page: ReactElement) {
  return <SidebarLayout>{page}</SidebarLayout>;
};

export default FinancePage;
