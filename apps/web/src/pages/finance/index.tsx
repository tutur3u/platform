import { ReactElement, useEffect, useState } from 'react';
import WalletTab from '../../components/finance/wallets/WalletTab';
import Layout from '../../components/layouts/Layout';
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
import TransactionEditForm from '../../components/forms/TransactionEditForm';
import { useTransactions } from '../../hooks/useTransactions';
import TransactionTab from '../../components/finance/transactions/TransactionTab';

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

  const {
    wallets,
    createWallet,
    updateWallet,
    deleteWallet,
    projectId,
    setProjectId,
    isWalletsLoading,
    walletId,
    setWalletId,
  } = useWallets();
  
  const { projects, isProjectsLoading } = useProjects();
  const {
    transactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    currentTransactions,
  } = useTransactions();

  let currentWallet = () => {
    const wallet = wallets.find((wallet) => wallet.id === walletId);
    return wallet;
  };

  let currentProject = () => {
    const project = projects.find((project) => project.id === projectId);
    return project;
  };

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
          projectId={projectId || ''}
          wallet={wallet}
          onSubmit={wallet ? updateWallet : createWallet}
          onDelete={wallet ? () => deleteWallet(wallet) : undefined}
        />
      ),
    });
  };

  const showEditTransactionModal = (transaction?: Transaction) => {
    openModal({
      title: (
        <div className="font-semibold">
          {transaction ? 'Edit transaction' : 'Create transaction'}
        </div>
      ),
      centered: true,
      children: (
        <TransactionEditForm
          wallets={wallets}
          isWalletsLoading={isWalletsLoading}
          transaction={transaction}
          onSubmit={transaction ? updateTransaction : createTransaction}
          onDelete={
            transaction ? () => deleteTransaction(transaction) : undefined
          }
        />
      ),
    });
  };

  if (!DEV_MODE)
    return (
      <>
        <HeaderX label="Finance" />
        <div className="p-4 md:h-screen md:p-8">
          <div className="flex h-full min-h-full w-full items-center justify-center rounded-lg border border-purple-300/20 bg-purple-300/10 p-8 text-center text-2xl font-semibold text-purple-300 md:text-6xl">
            Under construction 🚧
          </div>
        </div>
      </>
    );

  return (
    <>
      <div className="flex w-full">
        <div className="flex h-screen w-72 flex-col gap-8 border-r border-zinc-800 p-5">
          <Select
            label="Select project"
            placeholder="Select project"
            data={projects.map((project) => ({
              label: project.name,
              value: project.id,
            }))}
            value={projectId as string | undefined}
            onChange={setProjectId}
          />

          <button
            onClick={() => showEditWalletModal()}
            className="flex w-full items-center justify-center gap-2 rounded border border-zinc-800 bg-zinc-800/80 p-2 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-300/10 hover:text-zinc-200"
          >
            Create wallet
          </button>

          <div className="scrollbar-none flex flex-col gap-5 overflow-y-scroll">
            {wallets &&
              wallets.map((wallet, index) => (
                <WalletTab
                  key={index}
                  wallet={wallet}
                  onClick={() => setWalletId(wallet.id)}
                />
              ))}
          </div>
        </div>

        <div className="p-5">
          <button
            onClick={() => showEditTransactionModal()}
            className="flex w-full items-center justify-center gap-2 rounded border border-zinc-800 bg-zinc-800/80 p-2 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-300/10 hover:text-zinc-200"
          >
            Add transaction
          </button>

          <div className="scrollbar-none flex flex-col gap-5 overflow-y-scroll">
            {currentTransactions &&
              currentTransactions.map((transaction, index) => (
                <TransactionTab
                  key={index}
                  name={transaction.name}
                  amount={transaction.amount}
                  onClick={() => showEditTransactionModal(transaction)}
                />
              ))}
          </div>

          <div>{`This is wallet ${currentWallet.name} of project ${currentProject.name}`}</div>
        </div>
      </div>
    </>
  );
};

FinancePage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default FinancePage;
