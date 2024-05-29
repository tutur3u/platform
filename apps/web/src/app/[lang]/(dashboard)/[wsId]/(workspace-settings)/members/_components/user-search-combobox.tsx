import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useState } from 'react';
import { User } from '@/types/primitives/User';

interface Props {
  query: string;
  setQuery: (query: string) => void;

  user?: User;
  users: User[];
  setUser: (user?: User) => void;
}

export function UserSearchCombobox({
  query,
  user,
  users,
  setUser,
  setQuery,
}: Props) {
  const [open, setOpen] = useState(query !== '');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="justify-between"
        >
          {user?.display_name || user?.handle
            ? `${user?.display_name || user?.handle}`
            : 'Select a user'}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="p-0">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search for a user"
            value={query}
            onValueChange={setQuery}
          />

          <CommandEmpty>No user found.</CommandEmpty>
          <CommandList>
            {query && (
              <CommandGroup>
                {users.map((u) => (
                  <CommandItem
                    key={u.id}
                    onSelect={() => {
                      setUser(
                        user?.id === undefined
                          ? u
                          : u.id === user.id
                            ? u
                            : undefined
                      );
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        u.id === user?.id ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {u.display_name}
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
