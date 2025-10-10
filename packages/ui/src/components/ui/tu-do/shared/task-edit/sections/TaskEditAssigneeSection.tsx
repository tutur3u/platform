import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Check, Loader2, Search, Users, X } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { memo, useMemo, useState } from 'react';

interface WorkspaceMember {
  user_id: string;
  display_name: string;
  avatar_url?: string;
}

interface TaskEditAssigneeSectionProps {
  selectedAssignees: WorkspaceMember[];
  workspaceMembers: WorkspaceMember[];
  loadingMembers: boolean;
  onToggleAssignee: (member: WorkspaceMember) => void;
}

export const TaskEditAssigneeSection = memo(function TaskEditAssigneeSection({
  selectedAssignees,
  workspaceMembers,
  loadingMembers,
  onToggleAssignee,
}: TaskEditAssigneeSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');

  // Precompute Set of selected assignee IDs for O(1) membership tests
  const selectedIdSet = useMemo(() => {
    return new Set(selectedAssignees.map((a) => a.user_id));
  }, [selectedAssignees]);

  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return workspaceMembers;
    const query = searchQuery.toLowerCase();
    return workspaceMembers.filter((m) =>
      m.display_name.toLowerCase().includes(query)
    );
  }, [workspaceMembers, searchQuery]);

  return (
    <div className="space-y-3">
      <Label className="flex items-center gap-2 font-medium text-sm">
        <Users className="h-4 w-4" />
        Assignees
      </Label>

      {loadingMembers ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Search input */}
          <div className="relative">
            <Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search members..."
              className="pl-9"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-1 right-1 h-7 w-7 p-0"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          {/* Selected assignees */}
          {selectedAssignees.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedAssignees.map((assignee) => (
                <Button
                  key={assignee.user_id}
                  variant="secondary"
                  size="sm"
                  onClick={() => onToggleAssignee(assignee)}
                  className="h-8 gap-2 pr-2"
                >
                  <Avatar className="h-5 w-5">
                    {assignee.avatar_url && (
                      <AvatarImage src={assignee.avatar_url} />
                    )}
                    <AvatarFallback className="text-[10px]">
                      {getInitials(assignee.display_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-xs">{assignee.display_name}</span>
                  <X className="h-3 w-3" />
                </Button>
              ))}
            </div>
          )}

          {/* Available members */}
          <ScrollArea className="h-[200px] rounded-md border">
            <div className="space-y-1 p-2">
              {filteredMembers.length === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-sm">
                  No members found
                </div>
              ) : (
                filteredMembers.map((member) => {
                  const isSelected = selectedIdSet.has(member.user_id);

                  return (
                    <button
                      type="button"
                      key={member.user_id}
                      onClick={() => onToggleAssignee(member)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors',
                        isSelected
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-muted'
                      )}
                    >
                      <Avatar className="h-8 w-8">
                        {member.avatar_url && (
                          <AvatarImage src={member.avatar_url} />
                        )}
                        <AvatarFallback className="text-xs">
                          {getInitials(member.display_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex-1 text-sm">
                        {member.display_name}
                      </span>
                      {isSelected && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
});
