import { Select } from '@mantine/core';
import { Wallet } from '../../types/primitives/Wallet';
import useSWR from 'swr';
import { useEffect } from 'react';
import { useWorkspaces } from '../../hooks/useWorkspaces';
import { useRouter } from 'next/router';

interface Props {
  walletId?: string;
  wallet: Wallet | null;
  setWallet: (wallet: Wallet | null) => void;

  blacklist?: string[];
  className?: string;

  preventPreselected?: boolean;
  disableQuery?: boolean;
  clearable?: boolean;
  hideLabel?: boolean;
  disabled?: boolean;
  required?: boolean;
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
  disabled = false,
  required = false,
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
      label: `${wallet.name} ${
        wallet?.balance != null
          ? `(${Intl.NumberFormat('vi-VN', {
              style: 'currency',
              currency: 'VND',
            }).format(wallet?.balance || 0)})`
          : ''
      }`,
      value: wallet.id,
      disabled: blacklist.includes(wallet.id),
    })) || []),
  ];

  useEffect(() => {
    if (!wallets) return;

    const id = _walletId || disableQuery ? null : walletId;
    const currentWallet = wallets.find((v) => v.id === id) || null;

    if (
      id &&
      wallets.find((v) => v.id === id) &&
      (currentWallet?.balance !== wallet?.balance ||
        currentWallet?.name !== wallet?.name)
    ) {
      setWallet(currentWallet);

      // Remove walletId from query
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
      disabled={!wallets || disabled}
      required={required}
      clearable={clearable}
      searchable
    />
  );
};

export default WalletSelector;
