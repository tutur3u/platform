'use client';

import { Trash2, User } from '@tuturuuu/icons';
import { getInitials } from '@tuturuuu/utils/name-helper';
import type { ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import {
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';

/** A saved account's avatar in the account switcher, with initials fallback. */
export function AccountSwitcherAvatar({
  avatarUrl,
  name,
}: {
  avatarUrl: string | null | undefined;
  name: string;
}) {
  const initials = name ? getInitials(name) : '';
  return (
    <Avatar className="size-6 shrink-0 rounded-md" data-slot="account-avatar">
      <AvatarImage
        src={avatarUrl ?? undefined}
        alt=""
        className="aspect-square rounded-md object-cover"
      />
      <AvatarFallback className="rounded-md font-semibold text-[10px]">
        {initials || <User className="h-3.5 w-3.5" />}
      </AvatarFallback>
    </Avatar>
  );
}

/** Manage Accounts: an in-app action when `onOpen` is set, else a central link. */
export function ManageAccountsItem({
  href,
  icon,
  label,
  onOpen,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  onOpen?: () => void;
}) {
  if (onOpen) {
    return (
      <DropdownMenuItem className="cursor-pointer" onSelect={onOpen}>
        {icon}
        <span>{label}</span>
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuItem asChild>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="cursor-pointer"
      >
        {icon}
        <span>{label}</span>
      </a>
    </DropdownMenuItem>
  );
}

/** Remove account: every saved account except the active one can be removed. */
export function RemoveAccountSubmenu({
  accounts,
  activeAccountId,
  disabled,
  label,
  onRemove,
}: {
  accounts: { id: string; label: string }[];
  activeAccountId: string | null;
  disabled: boolean;
  label: string;
  onRemove: (accountId: string) => void;
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger disabled={disabled}>
        <Trash2 className="h-4 w-4 text-dynamic-red" />
        <span>{label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent sideOffset={4} className="w-72">
          {accounts.map((account) => {
            const isActive = account.id === activeAccountId;
            return (
              <DropdownMenuItem
                key={account.id}
                disabled={isActive || disabled}
                onSelect={() => {
                  if (!isActive) onRemove(account.id);
                }}
              >
                <Trash2 className="h-4 w-4 text-dynamic-red" />
                <span className="truncate">{account.label}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
