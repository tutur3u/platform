'use client';

import { LoaderCircle, Search, X } from '@tuturuuu/icons';
import type { ChatUserProfile } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import { Input } from '../input';
import { getChatInitials } from './utils';

export function DirectoryUserPicker({
  directoryQuery,
  filteredUsers,
  isFetching,
  onDirectoryQueryChange,
  onRemoveUser,
  onSelectUser,
  selectedUsers,
}: {
  directoryQuery: string;
  filteredUsers: ChatUserProfile[];
  isFetching?: boolean;
  onDirectoryQueryChange: (value: string) => void;
  onRemoveUser: (userId: string) => void;
  onSelectUser: (user: ChatUserProfile) => void;
  selectedUsers: ChatUserProfile[];
}) {
  const t = useTranslations('chat');

  return (
    <div className="min-h-0 rounded-md border">
      <div className="border-b p-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            onChange={(event) => onDirectoryQueryChange(event.target.value)}
            placeholder={t('directory_search_placeholder')}
            value={directoryQuery}
          />
        </div>

        {selectedUsers.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedUsers.map((user) => (
              <SelectedUserChip
                key={user.id}
                onRemove={() => onRemoveUser(user.id)}
                user={user}
              />
            ))}
          </div>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto p-2">
        {isFetching ? (
          <div className="flex items-center justify-center p-4 text-muted-foreground text-sm">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            {t('loading_directory')}
          </div>
        ) : filteredUsers.length > 0 ? (
          filteredUsers.map((user) => (
            <DirectoryUserRow
              key={user.id}
              onSelect={() => onSelectUser(user)}
              user={user}
            />
          ))
        ) : (
          <div className="p-4 text-center text-muted-foreground text-sm">
            {t('empty_directory')}
          </div>
        )}
      </div>
    </div>
  );
}

function DirectoryUserRow({
  onSelect,
  user,
}: {
  onSelect: () => void;
  user: ChatUserProfile;
}) {
  return (
    <button
      className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
      onClick={onSelect}
      type="button"
    >
      <Avatar className="size-8">
        <AvatarImage alt={user.displayName} src={user.avatarUrl ?? undefined} />
        <AvatarFallback>{getChatInitials(user)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0">
        <span className="block truncate font-medium text-sm">
          {user.displayName}
        </span>
        {user.handle && (
          <span className="block truncate text-muted-foreground text-xs">
            {user.handle}
          </span>
        )}
      </span>
    </button>
  );
}

function SelectedUserChip({
  onRemove,
  user,
}: {
  onRemove: () => void;
  user: ChatUserProfile;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-sm">
      <span className="max-w-40 truncate">{user.displayName}</span>
      <button
        className="rounded-sm text-muted-foreground transition-colors hover:text-foreground"
        onClick={onRemove}
        type="button"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}
