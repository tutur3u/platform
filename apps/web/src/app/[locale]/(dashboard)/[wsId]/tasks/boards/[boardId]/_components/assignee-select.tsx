'use client';

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/ui/components/ui/avatar';
import { Button } from '@repo/ui/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@repo/ui/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@repo/ui/components/ui/popover';
import { cn } from '@repo/ui/lib/utils';
import { createClient } from '@tutur3u/supabase/next/client';
import { Check, ChevronsUpDown, Loader2, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

interface Member {
  id: string;
  display_name?: string;
  email?: string;
  avatar_url?: string;
  handle?: string;
}

interface Props {
  taskId: string;
  assignees?: Member[];
  onUpdate?: () => void;
}

export function AssigneeSelect({ taskId, assignees = [], onUpdate }: Props) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const fetchMembers = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('workspace_members_and_invites')
        .select('id, display_name, email, avatar_url, handle')
        .eq('pending', false);

      if (!error && data) {
        const validMembers = data
          .filter((member) => member.id !== null)
          .map((member) => ({
            id: member.id,
            display_name: member.display_name || undefined,
            email: member.email || undefined,
            avatar_url: member.avatar_url || undefined,
            handle: member.handle || undefined,
          }));
        setMembers(validMembers as Member[]);
      }
    };

    fetchMembers();
  }, []);

  const handleSelect = async (memberId: string) => {
    if (!onUpdate) return;

    try {
      setIsLoading(true);
      const supabase = createClient();
      const isAssigned = assignees.some((assignee) => assignee.id === memberId);

      if (isAssigned) {
        // Remove assignee
        await supabase
          .from('task_assignees')
          .delete()
          .eq('task_id', taskId)
          .eq('user_id', memberId);
      } else {
        // Add assignee
        await supabase.from('task_assignees').insert({
          task_id: taskId,
          user_id: memberId,
        });
      }

      onUpdate();
    } catch (error) {
      console.error('Failed to update task assignees:', error);
    } finally {
      setIsLoading(false);
      setOpen(false);
    }
  };

  const assignedMembers = members.filter((member) =>
    assignees.some((assignee) => assignee.id === member.id)
  );
  const unassignedMembers = members.filter(
    (member) => !assignees.some((assignee) => assignee.id === member.id)
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          disabled={isLoading}
          className="group h-auto justify-between px-2 py-1 text-xs hover:bg-muted/50"
        >
          {assignees.length > 0 ? (
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {assignees.slice(0, 3).map((assignee) => (
                  <Avatar
                    key={assignee.id}
                    className="h-4 w-4 border-2 border-background ring-1 ring-background"
                  >
                    <AvatarImage src={assignee.avatar_url} />
                    <AvatarFallback className="text-[8px]">
                      {assignee.display_name?.[0] ||
                        assignee.email?.[0] ||
                        assignee.handle?.[0] ||
                        '?'}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              {assignees.length > 3 && (
                <span className="text-xs text-muted-foreground">
                  +{assignees.length - 3}
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>Unassigned</span>
            </div>
          )}
          {isLoading ? (
            <Loader2 className="ml-2 h-3 w-3 animate-spin" />
          ) : (
            <ChevronsUpDown
              className={cn(
                'ml-2 h-3 w-3 shrink-0 opacity-50 transition-opacity',
                'group-hover:opacity-100'
              )}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0" align="start" side="top">
        <Command>
          <CommandInput
            placeholder="Search members..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList>
            <CommandEmpty>No members found.</CommandEmpty>
            {assignedMembers.length > 0 && (
              <CommandGroup heading="Assigned">
                {assignedMembers.map((member) => (
                  <CommandItem
                    key={member.id}
                    value={member.id}
                    onSelect={() => handleSelect(member.id)}
                    className="gap-3"
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={member.avatar_url} />
                      <AvatarFallback>
                        {member.display_name?.[0] ||
                          member.email?.[0] ||
                          member.handle?.[0] ||
                          '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate">
                      {member.display_name || member.email || member.handle}
                    </span>
                    <Check className="h-4 w-4" />
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {assignedMembers.length > 0 && unassignedMembers.length > 0 && (
              <CommandSeparator />
            )}
            {unassignedMembers.length > 0 && (
              <CommandGroup heading="Available">
                {unassignedMembers.map((member) => (
                  <CommandItem
                    key={member.id}
                    value={member.id}
                    onSelect={() => handleSelect(member.id)}
                    className="gap-3"
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={member.avatar_url} />
                      <AvatarFallback>
                        {member.display_name?.[0] ||
                          member.email?.[0] ||
                          member.handle?.[0] ||
                          '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate">
                      {member.display_name || member.email || member.handle}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
