import { Modal, Textarea, TextInput, useMantineTheme } from '@mantine/core';
import { ReactElement, useEffect, useState } from 'react';
import WalletTab from '../../../components/finance/wallets/WalletTab';
import Layout from '../../../components/layouts/Layout';
import HeaderX from '../../../components/metadata/HeaderX';
import { DEV_MODE } from '../../../constants/common';
import { useAppearance } from '../../../hooks/useAppearance';
import { useUserData } from '../../../hooks/useUserData';
import { useUserList } from '../../../hooks/useUserList';
import { PageWithLayoutProps } from '../../../types/PageWithLayoutProps';

// create interface Wallet
interface Wallet {
  name: string;
  balance: number;
  description: string;
}

const dummyData = [
  {
    name: 'MB Bank',
    balance: 1000000,
    description: 'My first wallet',
  },
  {
    name: 'Vietcombank',
    balance: 2000000,
    description: 'My second wallet',
  },
  {
    name: 'Techcombank',
    balance: 3000000,
    description: 'My third wallet',
  },
];

const WalletsPage: PageWithLayoutProps = () => {
  const { setRootSegment, changeLeftSidebarSecondaryPref } = useAppearance();
  const { updateUsers } = useUserList();
  const { data } = useUserData();

  const [modalWalletOpened, setModalWalletOpened] = useState(false);

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

  const theme = useMantineTheme();

  const [wallets, setWallets] = useState<Wallet[]>(dummyData);

  const [balance, setBalance] = useState('');
  const [walletName, setWalletName] = useState('');
  const [description, setDescription] = useState('');

  const handleAddWallet = () => {
    const newWallet = {
      name: walletName,
      balance: Number(balance),
      description: description,
    };
    setWallets([...wallets, newWallet]);
    setBalance('');
    setWalletName('');
    setDescription('');
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
      <div className="flex w-full ">
        <div className="flex h-screen w-72 flex-col gap-8 border p-5">
          <Modal
            opened={modalWalletOpened}
            onClose={() => setModalWalletOpened(false)}
            title="Add Wallet"
            overlayColor={
              theme.colorScheme === 'dark'
                ? theme.colors.dark[9]
                : theme.colors.gray[2]
            }
            overlayOpacity={0.55}
            overlayBlur={3}
          >
            <div className="flex flex-col gap-4">
              <TextInput
                value={balance}
                onChange={(event) => setBalance(event.currentTarget.value)}
                placeholder="Balance"
              />
              <TextInput
                value={walletName}
                onChange={(event) => setWalletName(event.currentTarget.value)}
                placeholder="Wallet name"
              />
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.currentTarget.value)}
                placeholder="Description"
                autosize
                minRows={2}
                maxRows={4}
              />
            </div>
            <div className="mt-3 text-right">
              <button
                onClick={() => handleAddWallet()}
                className="rounded-md bg-zinc-800 px-3 py-1 hover:bg-blue-300/30 hover:text-blue-300"
              >
                Save
              </button>
            </div>
          </Modal>

          <div
            onClick={() => setModalWalletOpened(true)}
            className="rounded-lg bg-zinc-800 p-2 text-center hover:cursor-pointer"
          >
            Create your first wallet
          </div>

          <div className="scrollbar-none flex flex-col gap-5 overflow-y-scroll">
            {wallets.map((wallet, index) => (
              <WalletTab
                key={index}
                name={wallet.name}
                balance={wallet.balance}
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
