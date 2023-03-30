import { ReactElement, useEffect, useState } from 'react';
import useSWR from 'swr';
import WalletTab from '../../../components/finance/wallets/WalletTab';
import { useSegments } from '../../../hooks/useSegments';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import { Wallet } from '../../../types/primitives/Wallet';
import WalletEditForm from '../../../components/forms/WalletEditForm';
import { closeAllModals, openModal } from '@mantine/modals';
import { Transaction } from '../../../types/primitives/Transaction';
import { useWallets } from '../../../hooks/useWallets';
import { Divider, Select } from '@mantine/core';
import NestedLayout from '../../../components/layouts/NestedLayout';
import TransactionEditForm from '../../../components/forms/TransactionEditForm';
import { useTransactions } from '../../../hooks/useTransactions';
import TransactionTab from '../../../components/finance/transactions/TransactionTab';
import WalletDeleteForm from '../../../components/forms/WalletDeleteForm';
import { useWorkspaces } from '../../../hooks/useWorkspaces';

const FinancePage: PageWithLayoutProps = () => {
  const { setRootSegment } = useSegments();
  const { ws } = useWorkspaces();

  useEffect(() => {
    setRootSegment(
      ws
        ? [
            {
              content: ws?.name || 'Unnamed Workspace',
              href: `/workspaces/${ws.id}`,
            },
            { content: 'Finance', href: `/finance` },
          ]
        : []
    );
  }, [ws, setRootSegment]);

  const { createWallet, updateWallet, deleteWallet } = useWallets();
  const { createTransaction, updateTransaction, deleteTransaction } =
    useTransactions();

  const [walletId, setWalletId] = useState<string | null>();
  const [wallet, setWallet] = useState<Wallet>();

  const { data: wallets } = useSWR<Wallet[] | null>(
    ws ? `/api/workspaces/${ws.id}/wallets` : null
  );

  const { data: transactions } = useSWR<Transaction[] | null>(
    ws && walletId
      ? `/api/workspaces/${ws.id}/wallets/${walletId}/transactions`
      : null
  );

  const [localTransactions, setLocalTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    if (transactions) setLocalTransactions(transactions);
  }, [transactions]);

  useEffect(() => {
    if (walletId) {
      const wallet = wallets?.find((wallet) => wallet.id === walletId);
      if (wallet) setWallet(wallet);
    }
  }, [walletId, wallets]);

  const showEditWalletModal = (wallet?: Wallet) => {
    if (!ws) return;
    openModal({
      title: (
        <div className="font-semibold">
          {wallet ? 'Edit wallet' : 'Create wallet'}
        </div>
      ),
      centered: true,
      children: (
        <WalletEditForm
          wsId={ws.id}
          wallet={wallet}
          onSubmit={wallet ? updateWallet : createWallet}
          onDelete={wallet ? () => showDeleteWalletModal(wallet) : undefined}
        />
      ),
    });
  };

  const showDeleteWalletModal = async (wallet: Wallet) => {
    if (!ws) return;
    openModal({
      title: <div className="font-semibold">Are you absolutely sure?</div>,
      centered: true,
      children: (
        <WalletDeleteForm
          wallet={wallet}
          onDelete={() => {
            deleteWallet(ws.id, wallet);
            setWalletId(null);
            closeAllModals();
          }}
        />
      ),
    });
  };

  const showEditTransactionModal = (transaction?: Transaction) => {
    if (!walletId || !ws) return;

    openModal({
      title: (
        <div className="font-semibold">
          {transaction ? 'Edit transaction' : 'Create transaction'}
        </div>
      ),
      centered: true,
      children: (
        <TransactionEditForm
          wsId={ws.id}
          walletId={walletId}
          transaction={transaction}
          onSubmit={transaction ? updateTransaction : createTransaction}
          onDelete={transaction ? deleteTransaction : undefined}
        />
      ),
    });
  };

  return (
    <>
      <div className="flex h-full w-full flex-col gap-4 md:flex-row">
        <div className="flex flex-col gap-2 md:h-full md:w-72">
          <button
            onClick={() => showEditWalletModal()}
            className="w-full rounded border border-zinc-800 bg-zinc-800/80 p-2 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-300/10 hover:text-zinc-200"
          >
            Create wallet
          </button>

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
              {localTransactions &&
                localTransactions.map((transaction) => (
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
    </>
  );
};

FinancePage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout noTabs>{page}</NestedLayout>;
};

export default FinancePage;
