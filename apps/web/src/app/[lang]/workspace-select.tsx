'use client';

import LoadingIndicator from '@/components/common/LoadingIndicator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { User } from '@/types/primitives/User';
import { Workspace } from '@/types/primitives/Workspace';
import { getInitials } from '@/utils/name-helper';
import { CaretSortIcon, PlusCircledIcon } from '@radix-ui/react-icons';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { CheckIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import useTranslation from 'next-translate/useTranslation';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

interface Props {
  user: User | null;
  workspaces: Workspace[] | null;
}

export default function WorkspaceSelect({ user, workspaces }: Props) {
  const { t } = useTranslation();

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

  // Toggle the menu when ⌘K is pressed
  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    }

    document.addEventListener('keydown', down);

    return () => {
      document.removeEventListener('keydown', down);
    };
  }, []);

  const [onlineUsers, setOnlineUsers] = useState<User[] | undefined>();

  useEffect(() => {
    async function trackPresence(channel: RealtimeChannel | null) {
      if (!wsId || !user || !channel) return;

      const userStatus = {
        id: user.id,
        display_name: user.display_name || user.handle || user.email,
        avatar_url: user.avatar_url,
        online_at: new Date().toISOString(),
      };

      channel
        .on('presence', { event: 'sync' }, () => {
          const newState = channel.presenceState();
          // console.log('sync', newState);

          const users = Object.values(newState)
            .map(
              (user) =>
                ({
                  ...user?.[0],
                }) as unknown as User
            )
            // sort ones with display_name first, then prioritize ones with avatar_url
            .sort((a, b) => {
              if (a.display_name && !b.display_name) return -1;
              if (!a.display_name && b.display_name) return 1;
              if (a.avatar_url && !b.avatar_url) return -1;
              if (!a.avatar_url && b.avatar_url) return 1;
              return 0;
            });

          setOnlineUsers(users);
        })
        // .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        //   console.log('join', key, newPresences);
        // })
        // .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        //   console.log('leave', key, leftPresences);
        // })
        .subscribe(async (status) => {
          if (status !== 'SUBSCRIBED') return;
          await channel.track(userStatus);
        });
    }

    const supabase = createClientComponentClient();
    const channel = wsId
      ? supabase.channel(
          `workspace:${wsId}`,
          user?.id
            ? {
                config: {
                  presence: {
                    key: user.id,
                  },
                },
              }
            : undefined
        )
      : null;

    trackPresence(channel);
    return () => {
      channel?.unsubscribe();
    };
  }, [wsId, user]);

  const { resolvedTheme } = useTheme();
  const isDefault = !resolvedTheme?.includes('-');

  if (!workspace || !workspaces?.length) return null;

  return (
    <>
      <div className="bg-foreground/20 mx-2 hidden h-4 w-[1px] rotate-[30deg] md:block" />
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
              <CaretSortIcon className="ml-1 h-4 w-4 shrink-0 opacity-50" />
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
                          if (!ws?.value || ws?.value === wsId) return;
                          onValueChange(ws.value);
                          setOpen(false);
                        }}
                        className={`text-sm ${
                          group.id === 'personal' ? 'opacity-50' : ''
                        }`}
                        disabled={!ws || group.id === 'personal'}
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
              <CommandSeparator />
              <CommandGroup>
                <DialogTrigger asChild>
                  <CommandItem
                    onSelect={() => {
                      setOpen(false);
                      setShowNewWorkspaceDialog(true);
                    }}
                    disabled
                  >
                    <PlusCircledIcon className="mr-2 h-5 w-5" />
                    Create new workspace
                  </CommandItem>
                </DialogTrigger>
              </CommandGroup>
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

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            aria-label="Online users"
            className="flex items-center gap-1 px-2"
            disabled={!onlineUsers}
          >
            {onlineUsers ? (
              onlineUsers.length > 0 ? (
                onlineUsers.slice(0, 3).map((user) => (
                  <div
                    key={user.id}
                    className="hidden items-center gap-2 md:flex"
                  >
                    <Avatar className="relative h-6 w-6 overflow-visible">
                      <AvatarImage
                        src={user?.avatar_url || undefined}
                        alt={
                          user.display_name || user.handle || user.email || '?'
                        }
                      />
                      <AvatarFallback className="text-xs font-semibold">
                        {getInitials(
                          user?.display_name ||
                            user?.handle ||
                            user.email ||
                            '?'
                        )}
                      </AvatarFallback>
                      <div
                        className={`absolute bottom-0 right-0 z-10 h-1.5 w-1.5 rounded-full ${
                          isDefault
                            ? 'bg-green-500 dark:bg-green-400'
                            : 'bg-foreground'
                        }`}
                      />
                    </Avatar>
                  </div>
                ))
              ) : (
                <span className="text-foreground/50">
                  {t('common:no_online_users')}
                </span>
              )
            ) : (
              <LoadingIndicator />
            )}

            {onlineUsers && (
              <div className="flex items-center gap-2 font-semibold md:hidden">
                <div>{onlineUsers.length || 0}</div>
                <div
                  className={`relative inset-0 h-2 w-2 rounded-full ${
                    isDefault
                      ? 'bg-green-500 dark:bg-green-400'
                      : 'bg-foreground'
                  }`}
                >
                  <div
                    className={`absolute h-2 w-2 animate-ping rounded-full ${
                      isDefault
                        ? 'bg-green-500 dark:bg-green-400'
                        : 'bg-foreground'
                    }`}
                  />
                </div>
              </div>
            )}

            {(onlineUsers?.length || 0) > 3 && (
              <span className="text-foreground/70 hidden text-xs font-semibold md:block">
                +{(onlineUsers?.length || 0) - 3}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="mx-2 my-1 md:m-0">
          <div className="grid gap-2">
            <div className="font-semibold">
              {t('common:currently_online')} ({onlineUsers?.length || 0})
            </div>
            <Separator className="mb-1" />
            {onlineUsers?.map((user) => (
              <div key={user.id} className="flex items-center gap-2">
                <Avatar className="relative h-8 w-8 overflow-visible">
                  <AvatarImage
                    src={user?.avatar_url || undefined}
                    alt={user.display_name || user.handle || user.email || '?'}
                  />
                  <AvatarFallback className="text-sm font-semibold">
                    {getInitials(
                      user?.display_name || user?.handle || user.email || '?'
                    )}
                  </AvatarFallback>
                  <div
                    className={`absolute bottom-0 right-0 z-10 h-2 w-2 rounded-full ${
                      isDefault
                        ? 'bg-green-500 dark:bg-green-400'
                        : 'bg-foreground'
                    }`}
                  >
                    <div
                      className={`absolute h-2 w-2 animate-ping rounded-full ${
                        isDefault
                          ? 'bg-green-500 dark:bg-green-400'
                          : 'bg-foreground'
                      }`}
                    />
                  </div>
                </Avatar>
                <span className="line-clamp-1">
                  {user.display_name ||
                    user.handle ||
                    user.email ||
                    t('common:unknown')}
                </span>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
