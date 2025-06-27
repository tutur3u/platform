'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import { Check, ChevronDown, Loader2, Users } from '@tuturuuu/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useCallback, useEffect, useState } from 'react';

interface WorkspaceUser {
  id: string;
  display_name?: string;
  full_name?: string;
  avatar_url?: string;
  email?: string;
}

interface UserSelectorProps {
  wsId: string;
  selectedUserId: string | null;
  // eslint-disable-next-line no-unused-vars
  onUserChange: (userId: string | null) => void;
  currentUserId: string;
  // eslint-disable-next-line no-unused-vars
  apiCall: (url: string, options?: RequestInit) => Promise<unknown>;
}

export function UserSelector({
  wsId,
  selectedUserId,
  onUserChange,
  currentUserId,
  apiCall,
}: UserSelectorProps) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(
    async ({ wsId }: { wsId: string }) => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiCall(`/api/v1/workspaces/${wsId}/members`);
        console.log('response', response);
        setUsers(
          Array.isArray(response)
            ? response
            : (response as { data: WorkspaceUser[] }).data || []
        );
      } catch (error) {
        console.error('Error fetching workspace users:', error);
        setError(
          error instanceof Error ? error.message : 'Failed to load users'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [apiCall]
  );

  useEffect(() => {
    fetchUsers({ wsId });
  }, [wsId, fetchUsers]);

  const selectedUser = selectedUserId
    ? users.find((user) => user.id === selectedUserId)
    : null;

  const currentUser = users.find((user) => user.id === currentUserId);

  const displayUser = selectedUser || currentUser;

  const getUserDisplayName = (user: WorkspaceUser) => {
    return user.display_name || user.full_name || user.email || 'Unknown User';
  };

  const getUserInitials = (user: WorkspaceUser) => {
    const name = getUserDisplayName(user);
    return name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const otherUsers = users.filter((user) => user.id !== currentUserId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          aria-expanded={open}
          className={cn(
            'min-w-[200px] justify-between transition-all hover:shadow-sm',
            selectedUserId && 'border-primary/50 bg-primary/5'
          )}
        >
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            {displayUser ? (
              <>
                <Avatar className="h-6 w-6">
                  <AvatarImage src={displayUser.avatar_url} />
                  <AvatarFallback className="bg-primary/10 text-xs">
                    {getUserInitials(displayUser)}
                  </AvatarFallback>
                </Avatar>
                <span className="truncate font-medium">
                  {selectedUserId === null
                    ? 'My Time'
                    : getUserDisplayName(displayUser)}
                </span>
                {selectedUserId === currentUserId && (
                  <Badge variant="secondary" className="px-1 py-0 text-xs">
                    You
                  </Badge>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">Select user...</span>
            )}
          </div>
          <ChevronDown
            className={cn(
              'ml-2 h-4 w-4 shrink-0 opacity-50 transition-transform',
              open && 'rotate-180'
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Search users..." className="h-9" />
          <CommandEmpty>
            {isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="ml-2 text-sm">Loading users...</span>
              </div>
            ) : error ? (
              <div className="py-6 text-center">
                <p className="text-sm text-destructive">{error}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => fetchUsers({ wsId })}
                  className="mt-2"
                >
                  Try Again
                </Button>
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground">No users found.</p>
              </div>
            )}
          </CommandEmpty>
          <CommandList className="max-h-60">
            {/* My Time option */}
            <CommandItem
              value="my-time"
              onSelect={() => {
                onUserChange(null);
                setOpen(false);
              }}
              className="cursor-pointer py-3"
            >
              <div className="flex flex-1 items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={currentUser?.avatar_url} />
                  <AvatarFallback className="bg-primary/10 text-xs">
                    {currentUser ? getUserInitials(currentUser) : 'ME'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="font-medium">My Time</span>
                  <span className="text-xs text-muted-foreground">
                    View your own time tracking
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedUserId === null && (
                  <Badge variant="secondary" className="text-xs">
                    Active
                  </Badge>
                )}
                <Check
                  className={cn(
                    'h-4 w-4 transition-opacity',
                    selectedUserId === null ? 'opacity-100' : 'opacity-0'
                  )}
                />
              </div>
            </CommandItem>

            {/* Other users */}
            {otherUsers.length > 0 && (
              <>
                <div className="px-2 py-1.5">
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Team Members ({otherUsers.length})
                  </p>
                </div>
                {otherUsers.map((user) => (
                  <CommandItem
                    key={user.id}
                    value={getUserDisplayName(user)}
                    onSelect={() => {
                      onUserChange(user.id);
                      setOpen(false);
                    }}
                    className="cursor-pointer py-3"
                  >
                    <div className="flex flex-1 items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user.avatar_url} />
                        <AvatarFallback className="bg-muted text-xs">
                          {getUserInitials(user)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {getUserDisplayName(user)}
                        </span>
                        {user.email && (
                          <span className="text-xs text-muted-foreground">
                            {user.email}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedUserId === user.id && (
                        <Badge variant="secondary" className="text-xs">
                          Viewing
                        </Badge>
                      )}
                      <Check
                        className={cn(
                          'h-4 w-4 transition-opacity',
                          selectedUserId === user.id
                            ? 'opacity-100'
                            : 'opacity-0'
                        )}
                      />
                    </div>
                  </CommandItem>
                ))}
              </>
            )}

            {!isLoading && !error && otherUsers.length === 0 && (
              <div className="py-6 text-center">
                <Users className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  You're the only member in this workspace
                </p>
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
