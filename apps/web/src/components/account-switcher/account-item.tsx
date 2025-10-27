'use client';

import type { StoredAccount } from '@tuturuuu/auth';
import { Check } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { useTranslations } from 'next-intl';

interface AccountItemProps {
  account: StoredAccount;
  isActive: boolean;
  onClick: () => void;
}

export function AccountItem({ account, isActive, onClick }: AccountItemProps) {
  const t = useTranslations();

  const displayName =
    account.metadata.displayName || account.metadata.email || 'Unknown User';
  const initials = displayName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg p-2 transition-colors hover:bg-dynamic-blue/10"
    >
      <Avatar className="h-8 w-8">
        <AvatarImage src={account.metadata.avatarUrl} alt={displayName} />
        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
      </Avatar>

      <div className="flex flex-1 flex-col items-start text-left">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{displayName}</span>
          {isActive && (
            <Badge variant="secondary" className="text-xs">
              {t('account_switcher.active')}
            </Badge>
          )}
        </div>
        {account.metadata.email && (
          <span className="text-xs text-foreground/60">
            {account.metadata.email}
          </span>
        )}
      </div>

      {isActive && <Check className="h-4 w-4 text-dynamic-green" />}
    </button>
  );
}
