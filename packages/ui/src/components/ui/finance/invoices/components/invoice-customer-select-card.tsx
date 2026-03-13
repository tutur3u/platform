'use client';

import { Check, ChevronsUpDown, Loader2, Search } from '@tuturuuu/icons';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { getAvatarPlaceholder, getInitials } from '@tuturuuu/utils/name-helper';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface InvoiceCustomerSelectCardProps {
  title: string;
  description: string;
  customers: WorkspaceUser[];
  selectedUserId: string;
  onSelect: (value: string) => void;
  selectedUser?: WorkspaceUser;
  showUserPreview?: boolean;
  loading?: boolean;
  isFetchingNextPage?: boolean;
  hasNextPage?: boolean;
  onLoadMore?: () => void;
  loadingMessage?: string;
  errorMessage?: string;
  emptyMessage?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  children?: React.ReactNode;
}

function getUserDisplayName(user: WorkspaceUser) {
  return user.full_name || user.display_name || 'Unknown';
}

function getUserSecondaryLabel(user: WorkspaceUser) {
  return user.email || user.phone || '-';
}

function getUserSearchValue(user: WorkspaceUser) {
  return [user.full_name, user.display_name, user.email, user.phone]
    .filter(Boolean)
    .join(' ');
}

export function InvoiceCustomerSelectCard({
  title,
  description,
  customers,
  selectedUserId,
  onSelect,
  selectedUser,
  showUserPreview = false,
  loading,
  isFetchingNextPage = false,
  hasNextPage = false,
  onLoadMore,
  loadingMessage,
  errorMessage,
  emptyMessage,
  searchValue,
  onSearchChange,
  children,
}: InvoiceCustomerSelectCardProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const commandWrapperRef = useRef<HTMLDivElement | null>(null);
  const customerCount = customers.length;

  const maybeLoadMore = useCallback(
    (element?: HTMLElement | null) => {
      if (
        !element ||
        !hasNextPage ||
        !onLoadMore ||
        isFetchingNextPage ||
        loading
      ) {
        return;
      }

      const distanceFromBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight;

      if (distanceFromBottom <= 48) {
        onLoadMore();
      }
    },
    [hasNextPage, isFetchingNextPage, loading, onLoadMore]
  );

  useEffect(() => {
    if (!open || !hasNextPage || !onLoadMore || isFetchingNextPage || loading) {
      return;
    }

    if (customerCount === 0) return;

    const commandList = commandWrapperRef.current?.querySelector(
      '[data-slot="command-list"]'
    ) as HTMLElement | null;

    if (!commandList) return;

    if (commandList.scrollHeight <= commandList.clientHeight + 24) {
      maybeLoadMore(commandList);
    }
  }, [
    customerCount,
    hasNextPage,
    isFetchingNextPage,
    loading,
    maybeLoadMore,
    onLoadMore,
    open,
  ]);

  const selectedUserLabel = useMemo(() => {
    if (!selectedUser) return null;
    return `${getUserDisplayName(selectedUser)} • ${getUserSecondaryLabel(selectedUser)}`;
  }, [selectedUser]);

  const resultMeta = errorMessage
    ? errorMessage
    : loading
      ? loadingMessage || t('ws-invoices.loading')
      : `${customerCount} ${t('ws-invoices.customer').toLowerCase()}${customerCount === 1 ? '' : 's'}`;

  return (
    <Card className="overflow-hidden border-border/80 bg-card/95 shadow-sm">
      <CardHeader className="px-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <div className="rounded-full border border-border/70 bg-muted/70 px-3 py-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
            {t('ws-invoices.live_search')}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4 pt-0 pb-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="customer-select">{t('ws-invoices.customer')}</Label>
            <span className="text-[11px] text-muted-foreground">
              {resultMeta}
            </span>
          </div>

          <Popover
            open={open}
            onOpenChange={(nextOpen) => {
              setOpen(nextOpen);
              if (!nextOpen) {
                onSearchChange('');
              }
            }}
          >
            <PopoverTrigger asChild>
              <Button
                id="customer-select"
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className={cn(
                  'h-auto min-h-12 w-full justify-between rounded-xl border-border/80 bg-background px-3 py-3 text-left shadow-sm transition-colors hover:bg-muted/30',
                  !selectedUserLabel && 'text-muted-foreground'
                )}
              >
                <span className="flex min-w-0 items-center gap-3">
                  {selectedUser ? (
                    <Avatar className="h-9 w-9 shrink-0 border">
                      <AvatarImage
                        src={
                          selectedUser.avatar_url ||
                          getAvatarPlaceholder(getUserDisplayName(selectedUser))
                        }
                        alt={getUserDisplayName(selectedUser)}
                      />
                      <AvatarFallback>
                        {getInitials(getUserDisplayName(selectedUser))}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border border-dashed bg-muted/60">
                      <Search className="h-4 w-4 text-muted-foreground" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {selectedUser
                        ? getUserDisplayName(selectedUser)
                        : t('ws-invoices.search_customers')}
                    </span>
                    <span className="block truncate text-muted-foreground text-xs">
                      {selectedUser
                        ? getUserSecondaryLabel(selectedUser)
                        : t('ws-invoices.search_customers_description')}
                    </span>
                  </span>
                </span>
                <ChevronsUpDown className="ml-3 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>

            <PopoverContent
              align="start"
              sideOffset={6}
              className="w-(--radix-popover-trigger-width) rounded-2xl border-border/80 p-0 shadow-xl"
            >
              <Command shouldFilter={false}>
                <div className="border-border/70 border-b bg-muted/30 px-3 py-2">
                  <CommandInput
                    value={searchValue}
                    onValueChange={onSearchChange}
                    placeholder={t('ws-invoices.search_customers')}
                    className="border-none focus-visible:ring-0"
                  />
                </div>

                <div ref={commandWrapperRef}>
                  <CommandList
                    className="max-h-80"
                    onScroll={(event) =>
                      maybeLoadMore(event.currentTarget as HTMLElement)
                    }
                  >
                    <CommandEmpty className="px-4 py-10 text-center text-muted-foreground text-sm">
                      {errorMessage ||
                        (loading
                          ? loadingMessage || t('ws-invoices.loading')
                          : emptyMessage ||
                            t('ws-invoices.no_customers_found'))}
                    </CommandEmpty>

                    <CommandGroup className="p-2">
                      {customers.map((user) => {
                        const isSelected = user.id === selectedUserId;
                        const displayName = getUserDisplayName(user);
                        const secondaryLabel = getUserSecondaryLabel(user);

                        return (
                          <CommandItem
                            key={user.id}
                            value={getUserSearchValue(user)}
                            onSelect={() => {
                              onSelect(user.id);
                              onSearchChange('');
                              setOpen(false);
                            }}
                            className="group rounded-xl px-2 py-2 aria-selected:bg-muted/70"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              <Avatar className="h-9 w-9 shrink-0 border">
                                <AvatarImage
                                  src={
                                    user.avatar_url ||
                                    getAvatarPlaceholder(displayName)
                                  }
                                  alt={displayName}
                                />
                                <AvatarFallback>
                                  {getInitials(displayName)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium text-sm">
                                  {displayName}
                                </p>
                                <p className="truncate text-muted-foreground text-xs">
                                  {secondaryLabel}
                                </p>
                              </div>
                              <div
                                className={cn(
                                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors',
                                  isSelected
                                    ? 'border-primary bg-primary text-primary-foreground'
                                    : 'border-border text-transparent group-hover:text-muted-foreground'
                                )}
                              >
                                <Check className="h-3.5 w-3.5" />
                              </div>
                            </div>
                          </CommandItem>
                        );
                      })}

                      {(hasNextPage || isFetchingNextPage) && (
                        <div className="space-y-2 px-3 py-3 text-center">
                          {isFetchingNextPage ? (
                            <div className="flex items-center justify-center gap-2 text-muted-foreground text-xs">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              <span>
                                {t('ws-invoices.loading_more_customers')}
                              </span>
                            </div>
                          ) : hasNextPage ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mx-auto h-8 text-xs"
                              onClick={() => onLoadMore?.()}
                              disabled={isFetchingNextPage || loading}
                            >
                              {t('ws-invoices.load_more')}
                            </Button>
                          ) : null}
                        </div>
                      )}
                    </CommandGroup>
                  </CommandList>
                </div>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {showUserPreview && selectedUser && (
          <div className="rounded-2xl border border-border/80 bg-muted/30 p-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-11 w-11 shrink-0 border">
                <AvatarImage
                  src={
                    selectedUser.avatar_url ||
                    getAvatarPlaceholder(getUserDisplayName(selectedUser))
                  }
                  alt={getUserDisplayName(selectedUser)}
                />
                <AvatarFallback>
                  {getInitials(getUserDisplayName(selectedUser))}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {getUserDisplayName(selectedUser)}
                </p>
                <p className="truncate text-muted-foreground text-sm">
                  {getUserSecondaryLabel(selectedUser)}
                </p>
              </div>
            </div>
          </div>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
