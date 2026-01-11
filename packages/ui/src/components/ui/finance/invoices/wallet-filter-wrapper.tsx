'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useQueryState } from 'nuqs';
import { useWallets } from './hooks';

interface WalletFilterWrapperProps {
  wsId: string;
}

export function WalletFilterWrapper({ wsId }: WalletFilterWrapperProps) {
  const t = useTranslations();
  const [walletId, setWalletId] = useQueryState('walletId', { shallow: false });
  const { data: wallets = [], isLoading } = useWallets(wsId);

  // If no wallets or loading, show nothing or placeholder?
  // Better to show it so user knows it's there.
  // If loading, maybe disabled.

  const handleValueChange = (value: string) => {
    if (value === 'all') {
      setWalletId(null);
    } else {
      setWalletId(value);
    }
  };

  return (
    <div className="w-50">
      <Select
        value={walletId || 'all'}
        onValueChange={handleValueChange}
        disabled={isLoading}
      >
        <SelectTrigger>
          <SelectValue placeholder={t('ws-wallets.filter_by_wallet')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('ws-wallets.all_wallets')}</SelectItem>
          {wallets.map((wallet) => (
            <SelectItem key={wallet.id} value={wallet.id || ''}>
              {wallet.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
