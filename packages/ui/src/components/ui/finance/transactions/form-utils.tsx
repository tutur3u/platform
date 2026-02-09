import {
  ArrowDownCircle,
  ArrowUpCircle,
  CreditCard,
  Wallet,
} from '@tuturuuu/icons';
import type { TransactionCategory } from '@tuturuuu/types/primitives/TransactionCategory';
import type { Wallet as WalletType } from '@tuturuuu/types/primitives/Wallet';
import type {
  getIconComponentByKey,
  PlatformIconKey,
} from '@tuturuuu/ui/custom/icon-picker';
import Image from 'next/image';
import type * as React from 'react';
import { getWalletImagePath } from '../wallets/wallet-images';

export function getCategoryIcon(
  category: TransactionCategory,
  iconGetter: typeof getIconComponentByKey
): React.ReactNode {
  const IconComponent = category.icon
    ? iconGetter(category.icon as PlatformIconKey)
    : null;

  if (IconComponent) {
    return <IconComponent className="h-4 w-4" />;
  }
  if (category.is_expense === false) {
    return <ArrowUpCircle className="h-4 w-4" />;
  }
  return <ArrowDownCircle className="h-4 w-4" />;
}

export function getWalletIcon(
  wallet: WalletType,
  iconGetter: typeof getIconComponentByKey
): React.ReactNode {
  if (wallet.image_src) {
    return (
      <Image
        src={getWalletImagePath(wallet.image_src)}
        alt=""
        className="h-4 w-4 rounded-sm object-contain"
        height={16}
        width={16}
      />
    );
  }
  if (wallet.icon) {
    const IconComponent = iconGetter(wallet.icon as PlatformIconKey);
    if (IconComponent) {
      return <IconComponent className="h-4 w-4" />;
    }
  }
  return wallet.type === 'CREDIT' ? (
    <CreditCard className="h-4 w-4" />
  ) : (
    <Wallet className="h-4 w-4" />
  );
}
