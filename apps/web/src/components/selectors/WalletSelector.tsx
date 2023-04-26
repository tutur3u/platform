import { Select } from '@mantine/core';
import { Wallet } from '../../types/primitives/Wallet';
import useSWR, { mutate } from 'swr';
import { useEffect } from 'react';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useRouter } from 'next/router';
import { showNotification } from '@mantine/notifications';

interface Props {
  walletId?: string | null;
  wallet: Wallet | null;
  setWallet: (wallet: Wallet | null) => void;

  blacklist?: string[];
  className?: string;

  preventPreselected?: boolean;
  disableQuery?: boolean;
  clearable?: boolean;
  hideLabel?: boolean;
  hideBalance?: boolean;

  disabled?: boolean;
  required?: boolean;
  searchable?: boolean;
  creatable?: boolean;
}

const WalletSelector = ({
  walletId: _walletId,
  wallet,
  setWallet,

  blacklist = [],
  className,

  preventPreselected = false,
  disableQuery = false,
  clearable = false,
  hideLabel = false,
  hideBalance = false,

  disabled = false,
  required = false,
  searchable = true,
  creatable = true,
}: Props) => {
  const router = useRouter();

  const {
    query: { walletId },
  } = router;

  const { ws } = useWorkspaces();

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/finance/wallets?blacklist=${blacklist
        .filter((id) => id !== wallet?.id && id !== '')
        .join(',')}`
    : null;

  const { data: wallets } = useSWR<Wallet[]>(apiPath);

  const data = [
    ...(wallets?.map((wallet) => ({
      label: `${wallet.name}${
        wallet?.balance != null && !hideBalance
          ? ` (${Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
            }).format(wallet?.balance || 0)})`
          : ''
      }`,
      value: wallet?.id || '',
      disabled: !wallet?.id || blacklist.includes(wallet.id),
    })) || []),
  ];

  useEffect(() => {
    if (!wallets) return;

    const id = wallet?.id || _walletId || (disableQuery ? null : walletId);

    const currentWallet =
      wallets.find((w) => w.id === id || w.id === _walletId) || null;

    if (
      currentWallet &&
      (currentWallet.id !== wallet?.id ||
        currentWallet.currency !== wallet?.currency ||
        currentWallet.name !== wallet?.name ||
        currentWallet.balance !== wallet?.balance)
    ) {
      setWallet(currentWallet);

      router.replace(
        {
          query: {
            ...router.query,
            walletId: undefined,
          },
        },
        undefined,
        { shallow: true }
      );

      return;
    }

    if (preventPreselected || wallet?.id) return;
    setWallet(wallets?.[0]);
  }, [
    router,
    _walletId,
    walletId,
    wallet,
    wallets,
    setWallet,
    preventPreselected,
    disableQuery,
  ]);

  const create = async ({
    wallet,
  }: {
    wsId: string;
    wallet: Partial<Wallet>;
  }): Promise<Wallet | null> => {
    if (!apiPath) return null;

    const res = await fetch(apiPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(wallet),
    });

    if (res.ok) {
      const { id } = await res.json();

      if (!id || typeof id !== 'string') {
        showNotification({
          title: 'Lỗi',
          message: 'Không thể tạo nguồn tiền',
          color: 'red',
        });
        return null;
      }

      return { ...wallet, id };
    } else {
      showNotification({
        title: 'Lỗi',
        message: 'Không thể tạo nguồn tiền',
        color: 'red',
      });
      return null;
    }
  };

  return (
    <Select
      label={hideLabel ? undefined : 'Nguồn tiền'}
      placeholder="Chọn nguồn tiền"
      data={data}
      value={wallet?.id}
      onChange={(id) => setWallet(wallets?.find((v) => v.id === id) || null)}
      className={className}
      styles={{
        item: {
          // applies styles to selected item
          '&[data-selected]': {
            '&, &:hover': {
              backgroundColor: '#6b686b',
              color: '#fff',
              fontWeight: 600,
            },
          },

          // applies styles to hovered item
          '&:hover': {
            backgroundColor: '#454345',
            color: '#fff',
          },
        },
      }}
      getCreateLabel={(query) => (
        <div>
          + Tạo <span className="font-semibold">{query}</span>
        </div>
      )}
      onCreate={(query) => {
        if (!ws?.id) return null;

        create({
          wsId: ws.id,
          wallet: {
            name: query,
            currency: 'VND',
            balance: 0,
          },
        }).then((item) => {
          if (!item) return null;

          mutate(apiPath, [...(wallets || []), item]);
          setWallet(item);

          return {
            label: item.name,
            value: item.id,
          };
        });
      }}
      nothingFound="Không tìm thấy nguồn tiền nào"
      disabled={!wallets || disabled}
      required={required}
      searchable={searchable}
      creatable={!!ws?.id && creatable}
      clearable={clearable}
    />
  );
};

export default WalletSelector;
