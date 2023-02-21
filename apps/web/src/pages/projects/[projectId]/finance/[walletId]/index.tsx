import { useRouter } from 'next/router';
import React, { ReactElement, useEffect, useState } from 'react';
import useSWR from 'swr';
import { Divider } from '@mantine/core';
import { PlusIcon } from '@heroicons/react/24/solid';
import { openModal } from '@mantine/modals';
import { useAppearance } from '../../../../../hooks/useAppearance';
import { Wallet } from '../../../../../types/primitives/Wallet';
import { useWallets } from '../../../../../hooks/useWallets';
import WalletEditForm from '../../../../../components/forms/WalletEditForm';
import HeaderX from '../../../../../components/metadata/HeaderX';
import NestedLayout from '../../../../../components/layouts/NestedLayout';

const WalletDetailPage = () => {
  const router = useRouter();
  const { projectId, walletId } = router.query;
  const { createWallet, updateWallet, deleteWallet } = useWallets();

  const { data: project } = useSWR(
    projectId ? `/api/projects/${projectId}` : null
  );

  const { data: wallets, error: walletsError } = useSWR<Wallet[] | null>(
    projectId ? `/api/projects/${projectId}/wallets` : null
  );

  const { data: wallet, error: walletError } = useSWR<Wallet>(
    walletId ? `/api/projects/${projectId}/documents/${walletId}` : null
  );

  const currentWallet = wallets?.find((w) => w.id === walletId);

  const { setRootSegment } = useAppearance();

  useEffect(() => {
    setRootSegment(
      project?.orgs?.id
        ? [
            {
              content: project?.orgs?.name || 'Unnamed Workspace',
              href: `/orgs/${project.orgs.id}`,
            },
            {
              content: 'Projects',
              href: `/orgs/${project?.orgs?.id}/projects`,
            },
            {
              content: project?.name || 'Untitled Project',
              href: `/projects/${projectId}`,
            },
            { content: 'Finance', href: `/projects/${projectId}/finance` },
            {
              content: wallet
                ? wallet?.name || 'Untitled Document'
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
            wallet ? () => deleteWallet(projectId as string, wallet) : undefined
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
            <h1 className="text-2xl font-bold">Finance</h1>
            <p className="text-zinc-400">
              Track financial progress and budget.
            </p>
          </div>
        </>
      )}

      <Divider className="my-4" />
      <div>
        <button
          onClick={() => showEditWalletModal(currentWallet)}
          className="flex items-center gap-1 rounded bg-blue-300/20 px-4 py-2 font-semibold text-blue-300 transition hover:bg-blue-300/10"
        >
          Edit wallet <PlusIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-8 mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"></div>
    </>
  );
};

WalletDetailPage.getLayout = function getLayout(page: ReactElement) {
  return <NestedLayout mode="project">{page}</NestedLayout>;
};

export default WalletDetailPage;