'use client';

import { User } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import type { ReactNode, Ref } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../dropdown-menu';
import { AnimatedSlotText } from './animated-slot-text';
import { useSidebarFooter } from './sidebar-footer-context';

/** Shared profile trigger and menu frame; adapters supply account services and preferences. */
export function SatelliteUserMenu({
  name,
  email,
  avatarUrl,
  secondaryLabel,
  hideMetadata: hideMetadataProp = false,
  online = false,
  label,
  loading = false,
  triggerRef,
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
  triggerRef?: Ref<HTMLButtonElement>;
  children: ReactNode;
}) {
  // In the expanded sidebar footer the name and email return beside the avatar.
  const hideMetadata = hideMetadataProp && !useSidebarFooter().expanded;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          aria-label={label}
          aria-busy={loading || undefined}
          disabled={loading}
          className={cn(
            'flex h-10 w-full gap-0 rounded-md p-0 text-start transition pointer-coarse:h-11',
            hideMetadata
              ? 'items-center justify-center'
              : 'items-center justify-start hover:bg-foreground/5'
          )}
        >
          <span className="flex h-full w-[var(--sidebar-rail-slot,2.5rem)] shrink-0 items-center justify-center">
            <Avatar className="relative h-8 w-8 cursor-pointer overflow-visible font-semibold">
              <AvatarImage
                src={avatarUrl ?? undefined}
                className="aspect-square overflow-clip rounded-lg object-cover"
              />
              <AvatarFallback className="rounded-lg font-semibold">
                {name ? getInitials(name) : <User className="h-5 w-5" />}
              </AvatarFallback>
              {online && (
                <div className="pointer-events-none absolute right-0 bottom-0 z-20 size-2.5 rounded-full bg-dynamic-green ring-2 ring-background" />
              )}
            </Avatar>
          </span>
          {!hideMetadata && (
            <div className="flex w-full min-w-0 flex-col items-start justify-center pr-1">
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
