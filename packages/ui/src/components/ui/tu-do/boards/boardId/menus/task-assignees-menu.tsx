import { Check, Loader2, Search, UserStar } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { Input } from '@tuturuuu/ui/input';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';

interface Member {
  id: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
}

interface TaskAssigneesMenuProps {
  taskAssignees: Member[];
  availableMembers: Member[];
  isLoading: boolean;
  assigneeSaving: string | null;
  onToggleAssignee: (assigneeId: string) => void;
  onMenuItemSelect: (e: Event, action: () => void) => void;
}

export function TaskAssigneesMenu({
  taskAssignees,
  availableMembers,
  isLoading,
  assigneeSaving,
  onToggleAssignee,
  onMenuItemSelect,
}: TaskAssigneesMenuProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Filter members based on search
  const filteredMembers = availableMembers.filter(
    (member) =>
      !searchQuery ||
      member.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      member.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <UserStar className="h-4 w-4 text-dynamic-yellow" />
        Assignees
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-80 p-0">
        {/* Search Input */}
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search members..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 border-0 bg-muted/50 pl-9 text-sm focus-visible:ring-0"
            />
          </div>
        </div>

        {/* Members List */}
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 px-2 py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground text-xs">Loading...</p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="px-2 py-6 text-center text-muted-foreground text-xs">
            {searchQuery
              ? 'No members found'
              : 'No workspace members available'}
          </div>
        ) : (
          <div className="max-h-[150px] overflow-auto">
            <div className="flex flex-col gap-1 p-1">
              {filteredMembers.map((member) => {
                const active = taskAssignees.some((a) => a.id === member.id);
                return (
                  <DropdownMenuItem
                    key={member.id}
                    onSelect={(e) =>
                      onMenuItemSelect(e as unknown as Event, () =>
                        onToggleAssignee(member.id)
                      )
                    }
                    disabled={assigneeSaving === member.id}
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-2',
                      active && 'bg-dynamic-yellow/10 text-dynamic-yellow'
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {assigneeSaving === member.id ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
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
                    {active && <Check className="h-4 w-4 shrink-0" />}
                  </DropdownMenuItem>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer with count */}
        {!isLoading && taskAssignees.length > 0 && (
          <div className="relative z-10 border-t bg-background shadow-sm">
            <div className="px-2 pt-1 pb-1 text-[10px] text-muted-foreground">
              {taskAssignees.length} assigned
            </div>
          </div>
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
