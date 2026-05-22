'use client';

import { LogOut, User } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { getInitials } from '@tuturuuu/utils/name-helper';
import type { HiveUser } from '../../../engine/types';

type HiveAccountMenuProps = {
  user: HiveUser;
  variant?: 'full' | 'icon';
};

export function HiveAccountMenu({
  user,
  variant = 'full',
}: HiveAccountMenuProps) {
  const displayName = user.displayName || user.email || 'Hive member';
  const fallback = getInitials(displayName) || 'H';

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        {variant === 'icon' ? (
          <button
            aria-label="Hive account"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-foreground transition hover:bg-muted/70"
            type="button"
          >
            <Avatar className="h-8 w-8 border border-border/40">
              <AvatarImage
                alt={displayName}
                src={user.avatarUrl ?? undefined}
              />
              <AvatarFallback className="bg-dynamic-green/15 font-semibold text-dynamic-green text-xs">
                {fallback}
              </AvatarFallback>
            </Avatar>
          </button>
        ) : (
          <button
            className="flex w-full items-center gap-3 rounded-lg border border-border/20 bg-muted/10 p-3 text-left text-foreground transition hover:bg-muted/20"
            type="button"
          >
            <Avatar className="h-9 w-9 border border-border/30">
              <AvatarImage
                alt={displayName}
                src={user.avatarUrl ?? undefined}
              />
              <AvatarFallback className="bg-dynamic-green/15 font-semibold text-dynamic-green text-xs">
                {fallback}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-sm">
                {displayName}
              </span>
              <span className="block truncate text-muted-foreground text-xs">
                {user.handle || user.email || user.id}
              </span>
            </span>
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === 'icon' ? 'end' : 'start'}
        className="w-72"
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage
                alt={displayName}
                src={user.avatarUrl ?? undefined}
              />
              <AvatarFallback className="text-xs">{fallback}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium text-sm">{displayName}</p>
              <p className="truncate text-muted-foreground text-xs">
                {user.email || user.id}
              </p>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <User className="h-4 w-4" />
          Centralized Tuturuuu account
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action="/api/auth/logout" method="post">
          <DropdownMenuItem asChild>
            <button
              className="w-full cursor-pointer text-dynamic-red focus:text-dynamic-red"
              type="submit"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
