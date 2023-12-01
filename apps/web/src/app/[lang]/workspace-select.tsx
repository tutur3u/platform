'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { User } from '@/types/primitives/User';
import { Workspace } from '@/types/primitives/Workspace';
import { getInitials } from '@/utils/name-helper';
import { CaretSortIcon } from '@radix-ui/react-icons';
import { CheckIcon } from 'lucide-react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { useState } from 'react';

interface Props {
  user: User;
  workspaces: Workspace[] | null;
}

export default function WorkspaceSelect({ user, workspaces }: Props) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();

  const groups = [
    {
      id: 'personal',
      label: 'Personal Account',
      teams: [
        {
          label:
            user?.display_name || user?.handle || user?.email || 'Personal',
          value: user?.id,
        },
      ],
    },
    {
      id: 'workspaces',
      label: 'Workspaces',
      teams:
        workspaces?.map((workspace) => ({
          label: workspace.name || 'Untitled',
          value: workspace.id,
        })) || [],
    },
  ];

  const [open, setOpen] = useState(false);
  const [showNewWorkspaceDialog, setShowNewWorkspaceDialog] = useState(false);

  const onValueChange = (wsId: string) => {
    const newPathname = pathname?.replace(/^\/[^/]+/, `/${wsId}`);
    if (newPathname) router.push(newPathname);
  };

  const wsId = params.wsId as string;
  const workspace = workspaces?.find((ws) => ws.id === wsId);
  if (!workspace || !workspaces?.length) return null;

  return (
    <>
      <div className="bg-foreground/20 h-4 w-[1px] rotate-[30deg]" />
      {/* <Select value={wsId} onValueChange={onValueChange} disabled={!workspaces}>
        <SelectTrigger className="w-full md:w-48">
          <SelectValue placeholder="Select a workspace" />
        </SelectTrigger>
        <SelectContent onCloseAutoFocus={(e) => e.preventDefault()}>
          <SelectGroup>
            {workspaces.map((workspace) => (
              <SelectItem key={workspace.id} value={workspace.id}>
                <span className="line-clamp-1">{workspace.name}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select> */}

      <Dialog
        open={showNewWorkspaceDialog}
        onOpenChange={setShowNewWorkspaceDialog}
      >
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-label="Select a workspace"
              className={cn('w-full max-w-[16rem] justify-between')}
            >
              <Avatar className="mr-2 h-5 w-5">
                <AvatarImage
                  src={`https://avatar.vercel.sh/${workspace.name}.png`}
                  alt={workspace.name}
                />
                <AvatarFallback>{getInitials(workspace.name)}</AvatarFallback>
              </Avatar>
              <span className="line-clamp-1">{workspace.name}</span>
              <CaretSortIcon className="ml-auto h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full max-w-[16rem] p-0">
            <Command>
              <CommandList>
                <CommandInput placeholder="Search workspace..." />
                <CommandEmpty>No workspace found.</CommandEmpty>
                {groups.map((group) => (
                  <CommandGroup key={group.label} heading={group.label}>
                    {group.teams.map((ws) => (
                      <CommandItem
                        key={ws.value}
                        onSelect={() => {
                          onValueChange(ws.value);
                          setOpen(false);
                        }}
                        className={`text-sm ${
                          group.id === 'personal' ? 'opacity-50' : ''
                        }`}
                        disabled={group.id === 'personal'}
                      >
                        <Avatar className="mr-2 h-5 w-5">
                          <AvatarImage
                            src={`https://avatar.vercel.sh/${ws.label}.png`}
                            alt={ws.label}
                            className="grayscale"
                          />
                          <AvatarFallback>
                            {getInitials(ws.label)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="line-clamp-1">{ws.label}</span>
                        {group.id !== 'personal' && (
                          <CheckIcon
                            className={cn(
                              'ml-auto h-4 w-4',
                              wsId === ws.value ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
              {/* <CommandSeparator />
              <CommandList>
                <CommandGroup>
                  <DialogTrigger asChild>
                    <CommandItem
                      onSelect={() => {
                        setOpen(false);
                        setShowNewWorkspaceDialog(true);
                      }}
                    >
                      <PlusCircledIcon className="mr-2 h-5 w-5" />
                      Create new workspace
                    </CommandItem>
                  </DialogTrigger>
                </CommandGroup>
              </CommandList> */}
            </Command>
          </PopoverContent>
        </Popover>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create workspace</DialogTitle>
            <DialogDescription>
              Add a new workspace to easily manage everything that matters to
              you, and collaborate with your team as you go.
            </DialogDescription>
          </DialogHeader>
          <div>
            <div className="space-y-4 py-2 pb-4">
              <div className="space-y-2">
                <Label htmlFor="name">Workspace name</Label>
                <Input id="name" placeholder="Acme Inc." />
              </div>
              <div className="space-y-2">
                <Label htmlFor="plan">Subscription plan</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a plan" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">
                      <span className="font-medium">Free</span> -{' '}
                      <span className="text-muted-foreground">
                        $0/month per user
                      </span>
                    </SelectItem>
                    <SelectItem value="pro" disabled>
                      <span className="font-medium">Pro</span> -{' '}
                      <span className="text-muted-foreground">Coming soon</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewWorkspaceDialog(false)}
            >
              Cancel
            </Button>
            <Button type="submit">Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
