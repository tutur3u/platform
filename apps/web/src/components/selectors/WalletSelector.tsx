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

  softDisabled?: boolean;
  preventPreselected?: boolean;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

const WalletSelector = ({
  walletId: _walletId,
  wallet,
  setWallet,

  blacklist = [],

  className,

  preventPreselected = false,
  disabled = false,
  required = false,
}: Props) => {
  const {
    query: { walletId },
  } = useRouter();

  const { ws } = useWorkspaces();

  const apiPath = ws?.id
    ? `/api/workspaces/${ws?.id}/finance/wallets?blacklist=${blacklist
        .filter((id) => id !== wallet?.id && id !== '')
        .join(',')}`
    : null;

  const { data: wallets } = useSWR<Wallet[]>(apiPath);

  const data = [
    ...(wallets?.map((wallet) => ({
      label: wallet.name,
      value: wallet.id,
      disabled: blacklist.includes(wallet.id),
    })) || []),
  ];

  useEffect(() => {
    if (!wallets || !setWallet || wallet?.id) return;

    const id = _walletId || walletId;

    if (id && wallets.find((v) => v.id === id)) {
      setWallet(wallets.find((v) => v.id === id) || null);
      return;
    }

    if (preventPreselected) return;
    setWallet(wallets?.[0]);
  }, [_walletId, walletId, wallet, wallets, setWallet, preventPreselected]);

  return (
    <Select
      label="Nguồn tiền"
      placeholder="Chọn nguồn tiền"
      data={data}
      value={wallet?.id}
      onChange={(id) => setWallet(wallets?.find((v) => v.id === id) || null)}
      className={className}
      classNames={{
        input:
          'bg-[#3f3a3a]/30 border-zinc-300/20 focus:border-zinc-300/20 border-zinc-300/20 font-semibold',
        dropdown: 'bg-[#323030]',
      }}
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
      searchable
    />
  );
};

export default WalletSelector;
