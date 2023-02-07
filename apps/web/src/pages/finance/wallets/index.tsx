import { ReactElement, useEffect, useState } from 'react';
import WalletTab from '../../../components/finance/wallets/WalletTab';
import Layout from '../../../components/layouts/Layout';
import HeaderX from '../../../components/metadata/HeaderX';
import { DEV_MODE } from '../../../constants/common';
import { useAppearance } from '../../../hooks/useAppearance';
import { useUserData } from '../../../hooks/useUserData';
import { useUserList } from '../../../hooks/useUserList';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';
import { Wallet } from '../../../types/primitives/Wallet';
import WalletEditForm from '../../../components/forms/WalletEditForm';
import { openModal } from '@mantine/modals';

const dummyData: Wallet[] = [
  {
    id: 'DUMMY_1',
    name: 'MB Bank',
    balance: 1000000,
    description: 'My first wallet',
    currency: 'VND',
  },
  {
    id: 'DUMMY_2',
    name: 'Vietcombank',
    balance: 2000000,
    description: 'My second wallet',
    currency: 'VND',
  },
  {
    id: 'DUMMY_3',
    name: 'Techcombank',
    balance: 3000000,
    description: 'My third wallet',
    currency: 'VND',
  },
];

const WalletsPage: PageWithLayoutProps = () => {
  const { setRootSegment, changeLeftSidebarSecondaryPref } = useAppearance();
  const { updateUsers } = useUserList();
  const { data } = useUserData();

  useEffect(() => {
    changeLeftSidebarSecondaryPref('hidden');
    setRootSegment({
      content: 'Wallet',
      href: '/wallets',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (data) updateUsers([data]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const [wallets, setWallets] = useState<Wallet[]>(dummyData);

  const createWallet = (wallet: Wallet) => {
    setWallets((prev) => [...prev, wallet]);
  };

  const editWallet = (wallet: Wallet) => {
    setWallets((prev) => prev.map((w) => (w.id === wallet.id ? wallet : w)));
  };

  const deleteWallet = (wallet: Wallet) => {
    setWallets((prev) => prev.filter((w) => w.id !== wallet.id));
  };

  const showEditOrgModal = (wallet?: Wallet) => {
    openModal({
      title: (
        <div className="font-semibold">
          {wallet ? 'Edit wallet' : 'Create wallet'}
        </div>
      ),
      centered: true,
      children: (
        <WalletEditForm
          wallet={wallet}
          onSubmit={wallet ? editWallet : createWallet}
          onDelete={wallet ? () => deleteWallet(wallet) : undefined}
        />
      ),
    });
  };

  if (!DEV_MODE)
    return (
      <>
        <HeaderX label="Wallet" />
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
          <button
            onClick={() => showEditOrgModal()}
            className="flex w-full items-center justify-center gap-2 rounded border border-zinc-800 bg-zinc-800/80 p-2 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-300/10 hover:text-zinc-200"
          >
            Create wallet
          </button>

          <div className="scrollbar-none flex flex-col gap-5 overflow-y-scroll">
            {wallets.map((wallet, index) => (
              <WalletTab
                key={index}
                name={wallet.name}
                balance={wallet.balance}
                onClick={() => showEditOrgModal(wallet)}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  );
};

WalletsPage.getLayout = function getLayout(page: ReactElement) {
  return <Layout>{page}</Layout>;
};

export default WalletsPage;
