import { Check, Loader2, UserStar, UserX } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import {
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { cn } from '@tuturuuu/utils/format';
import { useMemo, useState } from 'react';
import {
  clearTaskCommandSearchOnEscape,
  TaskCommandSearchInput,
} from '../../../shared/task-command-search-input';
import {
  handleTaskOptionShortcut,
  TaskOptionShortcutHint,
} from '../../../shared/task-option-shortcuts';
import { memberMatchesSearchQuery } from '../../../shared/task-resource-search-filters';

interface Member {
  id: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
}

interface TaskAssigneesMenuProps {
  forceOpen?: boolean;
  taskAssignees: Member[];
  availableMembers: Member[];
  isLoading: boolean;
  onToggleAssignee: (assigneeId: string) => void;
  onMenuItemSelect: (e: Event, action: () => void) => void;
  translations?: {
    assignees?: string;
    searchMembers?: string;
    loading?: string;
    noMembersFound?: string;
    noMembersAvailable?: string;
    assigned?: string;
    memberNoLongerInWorkspace?: string;
  };
}

export function TaskAssigneesMenu({
  forceOpen,
  taskAssignees,
  availableMembers,
  isLoading,
  onToggleAssignee,
  onMenuItemSelect,
  translations,
}: TaskAssigneesMenuProps) {
  // Use provided translations or fall back to English defaults
  const t = {
    assignees: translations?.assignees ?? 'Assignees',
    searchMembers: translations?.searchMembers ?? 'Search members...',
    loading: translations?.loading ?? 'Loading...',
    noMembersFound: translations?.noMembersFound ?? 'No members found',
    noMembersAvailable:
      translations?.noMembersAvailable ?? 'No workspace members available',
    assigned: translations?.assigned ?? 'assigned',
    memberNoLongerInWorkspace:
      translations?.memberNoLongerInWorkspace ??
      'Member no longer in workspace',
  };

  const [searchQuery, setSearchQuery] = useState('');

  // Merge availableMembers with taskAssignees to include removed members
  // Removed members are those in taskAssignees but not in availableMembers
  const { allMembers, removedMemberIds } = useMemo(() => {
    const memberMap = new Map<string, Member>();

    // Add all available workspace members
    for (const member of availableMembers) {
      if (member.id) {
        memberMap.set(member.id, member);
      }
    }

    // Find and add removed members (in taskAssignees but not in availableMembers)
    const removedIds = new Set<string>();
    for (const assignee of taskAssignees) {
      if (assignee.id && !memberMap.has(assignee.id)) {
        memberMap.set(assignee.id, assignee);
        removedIds.add(assignee.id);
      }
    }

    return {
      allMembers: Array.from(memberMap.values()),
      removedMemberIds: removedIds,
    };
  }, [availableMembers, taskAssignees]);

  const filteredMembers = allMembers.filter((member) =>
    memberMatchesSearchQuery(member, searchQuery)
  );
  const select = (action: () => void) =>
    onMenuItemSelect(
      { preventDefault: () => undefined } as unknown as Event,
      action
    );

  return (
    <DropdownMenuSub open={forceOpen || undefined}>
      <DropdownMenuSubTrigger>
        <UserStar className="h-4 w-4 text-dynamic-yellow" />
        {t.assignees}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className="w-80 p-0"
        onKeyDownCapture={(event) =>
          handleTaskOptionShortcut(event, Boolean(forceOpen), (digit) => {
            const member = digit > 0 ? filteredMembers[digit - 1] : undefined;
            if (!member || isLoading) return false;
            select(() => onToggleAssignee(member.id));
            return true;
          })
        }
        onEscapeKeyDown={(event) =>
          clearTaskCommandSearchOnEscape(event, searchQuery, setSearchQuery)
        }
      >
        <Command shouldFilter={false} className="rounded-none border-0">
          <TaskCommandSearchInput
            value={searchQuery}
            onValueChange={setSearchQuery}
            placeholder={t.searchMembers}
            className="h-9"
          />
          <CommandList className="max-h-56">
            {/* Members List */}
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 px-2 py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground text-xs">{t.loading}</p>
              </div>
            ) : filteredMembers.length === 0 ? (
              <CommandEmpty className="px-2 py-6 text-center text-muted-foreground text-xs">
                {searchQuery ? t.noMembersFound : t.noMembersAvailable}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {filteredMembers.map((member, index) => {
                  const active = taskAssignees.some((a) => a.id === member.id);
                  const isRemovedMember = removedMemberIds.has(member.id);
                  return (
                    <CommandItem
                      key={member.id}
                      value={`${member.display_name ?? ''} ${member.email ?? ''} ${member.id}`}
                      aria-checked={active}
                      role="menuitemcheckbox"
                      onSelect={() => select(() => onToggleAssignee(member.id))}
                      title={
                        isRemovedMember
                          ? t.memberNoLongerInWorkspace
                          : undefined
                      }
                      className={cn(
                        'flex cursor-pointer items-center justify-between gap-2',
                        isRemovedMember
                          ? 'bg-dynamic-red/10 text-dynamic-red'
                          : active && 'bg-dynamic-yellow/10 text-dynamic-yellow'
                      )}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {isRemovedMember ? (
                          <UserX className="h-4 w-4 shrink-0 text-dynamic-red" />
                        ) : (
                          <Avatar className="h-4 w-4 shrink-0">
                            <AvatarImage src={member.avatar_url} />
                            <AvatarFallback className="bg-muted font-semibold text-[9px]">
                              {member.display_name?.[0] ||
                                member.email?.[0] ||
                                '?'}
                            </AvatarFallback>
                          </Avatar>
                        )}
                        <span className="truncate text-sm">
                          {member.display_name || member.email}
                        </span>
                      </div>
                      <TaskOptionShortcutHint
                        digit={index + 1}
                        visible={!!forceOpen && index < 9}
                      />
                      {active && <Check className="h-4 w-4 shrink-0" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {/* Footer with count */}
            {!isLoading && taskAssignees.length > 0 && (
              <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
                {taskAssignees.length} {t.assigned}
              </div>
            )}
          </CommandList>
        </Command>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
