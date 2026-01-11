'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Users, X } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@tuturuuu/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { getAvatarPlaceholder, getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface UserFilterProps {
  wsId: string;
  selectedUserIds: string[];
  onUsersChange: (userIds: string[]) => void;
  className?: string;
  filterType?: 'all' | 'transaction_creators' | 'invoice_creators';
}

async function fetchWorkspaceUsers(
  wsId: string,
  filterType: 'all' | 'transaction_creators' | 'invoice_creators' = 'all'
): Promise<WorkspaceUser[]> {
  const supabase = await createClient();

  if (filterType === 'transaction_creators') {
    const { data, error } = await supabase
      .from('distinct_transaction_creators' as any)
      .select('id, display_name');

    if (error) throw error;
    return (data as unknown as WorkspaceUser[]) || [];
  }

  if (filterType === 'invoice_creators') {
    const { data, error } = await supabase
      .from('distinct_invoice_creators' as any)
      .select('id, display_name');

    if (error) throw error;
    return (data as unknown as WorkspaceUser[]) || [];
  }

  const { data, error } = await supabase
    .from('workspace_users')
    .select('id, full_name, display_name, email, avatar_url')
    .eq('ws_id', wsId)
    .order('full_name', { ascending: true });

  if (error) throw error;
  return data || [];
}

export function UserFilter({
  wsId,
  selectedUserIds,
  onUsersChange,
  className,
  filterType = 'all',
}: UserFilterProps) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);

  const hasActiveFilters = selectedUserIds.length > 0;

  // Use React Query to fetch and cache workspace users
  const {
    data: users = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['workspace-users', wsId, filterType],
    queryFn: () => fetchWorkspaceUsers(wsId, filterType),
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    enabled: !!wsId, // Only run query if wsId is provided
  });

  const handleUserToggle = (userId: string) => {
    const newSelectedUserIds = selectedUserIds.includes(userId)
      ? selectedUserIds.filter((id) => id !== userId)
      : [...selectedUserIds, userId];

    onUsersChange(newSelectedUserIds);
  };

  const clearAllFilters = () => {
    onUsersChange([]);
  };

  const isCreatorFilter =
    filterType === 'transaction_creators' || filterType === 'invoice_creators';
  const filterLabel = isCreatorFilter
    ? t('finance.filter_by_creator')
    : t('finance.filter_by_users');

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Active Filters Display */}
      {/* {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-1">
          {selectedUsers.map((user) => {
            const displayName = user.full_name || user.email || 'Unknown User';
            return (
              <Badge
                key={user.id}
                variant="secondary"
                className="h-6 gap-1 rounded-md px-2 text-xs"
              >
                <Avatar className="h-4 w-4">
                  <AvatarImage
                    src={user.avatar_url || getAvatarPlaceholder(displayName)}
                    alt={displayName}
                  />
                  <AvatarFallback className="text-xs">
                    {getInitials(displayName)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate">{displayName}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-destructive/20 hover:text-destructive"
                  onClick={() => handleUserToggle(user.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            );
          })}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-muted-foreground text-xs hover:text-foreground"
            onClick={clearAllFilters}
          >
            Clear all
          </Button>
        </div>
      )} */}

      {/* User Filter Dropdown */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Users className="h-3 w-3" />
            <span className="text-xs">{filterLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-70 p-0" align="start">
          <Command>
            <CommandInput
              placeholder={
                isCreatorFilter
                  ? t('finance.search_creators')
                  : t('finance.search_users')
              }
            />
            <CommandList>
              <CommandEmpty>
                {isLoading
                  ? isCreatorFilter
                    ? t('finance.loading_creators')
                    : t('finance.loading_users')
                  : isCreatorFilter
                    ? t('finance.no_creators_found')
                    : t('finance.no_users_found')}
              </CommandEmpty>

              {error && (
                <CommandGroup>
                  <CommandItem disabled className="text-destructive">
                    {error instanceof Error
                      ? error.message
                      : t('finance.failed_to_load_users')}
                  </CommandItem>
                </CommandGroup>
              )}

              {!isLoading && !error && users.length > 0 && (
                <CommandGroup>
                  {users
                    .sort((a, b) => {
                      // Sort selected users to the top
                      const aSelected = selectedUserIds.includes(a.id);
                      const bSelected = selectedUserIds.includes(b.id);

                      if (aSelected && !bSelected) return -1;
                      if (!aSelected && bSelected) return 1;

                      // For users with the same selection status, sort by name
                      const aName =
                        a.display_name || a.full_name || a.email || 'Unknown';
                      const bName =
                        b.display_name || b.full_name || b.email || 'Unknown';
                      return aName.localeCompare(bName);
                    })
                    .map((user) => {
                      const isSelected = selectedUserIds.includes(user.id);
                      const displayName =
                        user.display_name ||
                        user.full_name ||
                        user.email ||
                        'Unknown User';

                      return (
                        <CommandItem
                          key={user.id}
                          onSelect={() => handleUserToggle(user.id)}
                          className="flex cursor-pointer items-center gap-2"
                        >
                          <div
                            className={cn(
                              'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                              isSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'opacity-50 [&_svg]:invisible'
                            )}
                          >
                            <Check className="h-4 w-4" />
                          </div>
                          <Avatar className="h-6 w-6 border">
                            <AvatarImage
                              src={
                                user.avatar_url ||
                                getAvatarPlaceholder(displayName)
                              }
                              alt={displayName}
                            />
                            <AvatarFallback className="text-xs">
                              {getInitials(displayName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-1 flex-col">
                            <span className="font-medium text-sm">
                              {displayName}
                            </span>
                            {user.email && (
                              <span className="text-muted-foreground text-xs">
                                {user.email}
                              </span>
                            )}
                          </div>
                        </CommandItem>
                      );
                    })}
                </CommandGroup>
              )}

              {hasActiveFilters && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={clearAllFilters}
                      className="cursor-pointer justify-center text-center text-destructive"
                    >
                      <X className="mr-2 h-4 w-4" />
                      {t('common.clear_all_filters')}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
