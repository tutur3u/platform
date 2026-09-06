'use client';

import { User } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import type { ReactNode } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../dropdown-menu';
import { AnimatedSlotText } from './animated-slot-text';

/** Shared profile trigger and menu frame; adapters supply account services and preferences. */
export function SatelliteUserMenu({
  name,
  email,
  avatarUrl,
  secondaryLabel,
  hideMetadata = false,
  online = false,
  label,
  loading = false,
  children,
}: {
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
  secondaryLabel?: string;
  hideMetadata?: boolean;
  online?: boolean;
  label?: string;
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-busy={loading || undefined}
          disabled={loading}
          className={cn(
            'flex h-10 w-full gap-2 rounded-md p-1 text-start transition',
            hideMetadata
              ? 'items-center justify-center'
              : 'items-center justify-start hover:bg-foreground/5'
          )}
        >
          <Avatar className="relative h-8 w-8 cursor-pointer overflow-visible font-semibold">
            <AvatarImage
              src={avatarUrl ?? undefined}
              className="aspect-square overflow-clip rounded-lg object-cover"
            />
            <AvatarFallback className="rounded-lg font-semibold">
              {name ? getInitials(name) : <User className="h-5 w-5" />}
            </AvatarFallback>
            {online && (
              <div className="absolute right-0 bottom-0 z-20 h-3 w-3 rounded-full border-2 border-background bg-dynamic-green" />
            )}
          </Avatar>
          {!hideMetadata && (
            <div className="flex w-full min-w-0 flex-col items-start justify-center">
              <div className="line-clamp-1 break-all font-semibold text-sm">
                {name}
              </div>
              <AnimatedSlotText
                className="text-xs opacity-70"
                text={secondaryLabel ?? email ?? ''}
              />
            </div>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" side="right" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col">
            <span className="line-clamp-1 break-all font-medium text-sm">
              {name}
            </span>
            <p className="line-clamp-1 break-all text-xs opacity-70">{email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
