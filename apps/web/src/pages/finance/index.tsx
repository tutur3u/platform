import { ReactElement, useEffect, useState } from 'react';
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
  } = useWallets();
  const { projects, isProjectsLoading } = useProjects();

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
          projects={projects}
          isProjectsLoading={isProjectsLoading}
          wallet={wallet}
          onSubmit={wallet ? updateWallet : createWallet}
          onDelete={wallet ? () => deleteWallet(wallet) : undefined}
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
            value={projectId}
            onChange={setProjectId}
          />

          <button
            onClick={() => showEditOrgModal()}
            className="flex w-full items-center justify-center gap-2 rounded border border-zinc-800 bg-zinc-800/80 p-2 text-sm font-semibold text-zinc-400 transition hover:bg-zinc-300/10 hover:text-zinc-200"
          >
            Create wallet
          </button>

          <div className="scrollbar-none flex flex-col gap-5 overflow-y-scroll">
            {wallets &&
              wallets.map((wallet, index) => (
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

FinancePage.getLayout = function getLayout(page: ReactElement) {
  return <SidebarLayout>{page}</SidebarLayout>;
};

export default FinancePage;
