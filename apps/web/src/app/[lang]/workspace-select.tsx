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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
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
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { User } from '@/types/primitives/User';
import { Workspace } from '@/types/primitives/Workspace';
import { getInitials } from '@/utils/name-helper';
import { zodResolver } from '@hookform/resolvers/zod';
import { CaretSortIcon, PlusCircledIcon } from '@radix-ui/react-icons';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { RealtimeChannel } from '@supabase/supabase-js';
import { CheckIcon } from 'lucide-react';
import { useTheme } from 'next-themes';
import useTranslation from 'next-translate/useTranslation';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

interface Props {
  user: User | null;
  workspaces: Workspace[] | null;
}

const FormSchema = z.object({
  name: z.string().min(1).max(100),
  plan: z.enum(['FREE', 'PRO', 'ENTERPRISE']),
});

export default function WorkspaceSelect({ user, workspaces }: Props) {
  const { t } = useTranslation();

  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();

  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: '',
      plan: 'FREE',
    },
  });

  const [open, setOpen] = useState(false);
  const [showNewWorkspaceDialog, setShowNewWorkspaceDialog] = useState(false);

  const [loading, setLoading] = useState(false);

  async function onSubmit(formData: z.infer<typeof FormSchema>) {
    setLoading(true);

    const res = await fetch(`/api/v1/workspaces`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formData),
    });

    if (res.ok) {
      form.reset();

      const { id } = await res.json();

      router.push(`/${id}`);
      router.refresh();

      setShowNewWorkspaceDialog(false);
      setLoading(false);
      setOpen(false);
    } else {
      setLoading(false);
      toast({
        title: 'Error creating workspace',
        description: 'An error occurred while creating the workspace',
      });
    }
  }

  const groups = [
    {
      id: 'personal',
      label: t('common:personal_account'),
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
      label: t('common:workspaces'),
      teams:
        workspaces?.map((workspace) => ({
          label: workspace.name || 'Untitled',
          value: workspace.id,
        })) || [],
    },
  ];

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
      <div className="bg-foreground/20 mx-2 h-4 w-[1px] rotate-[30deg]" />
      <Dialog
        open={showNewWorkspaceDialog}
        onOpenChange={(open) => {
          form.reset();
          setShowNewWorkspaceDialog(open);
        }}
      >
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-label="Select a workspace"
              className={cn('w-full justify-between md:max-w-[16rem]')}
            >
              <Avatar className="mr-2 h-5 w-5">
                <AvatarImage
                  src={`https://avatar.vercel.sh/${workspace.name}.png`}
                  alt={workspace.name}
                />
                <AvatarFallback>{getInitials(workspace.name)}</AvatarFallback>
              </Avatar>
              <span className="line-clamp-1 hidden md:block">
                {workspace.name}
              </span>
              <CaretSortIcon className="ml-1 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full max-w-[16rem] p-0">
            <Command>
              <CommandInput placeholder="Search workspace..." />
              <CommandEmpty>No workspace found.</CommandEmpty>
              <CommandList className="max-h-64">
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
              <DialogTrigger asChild>
                <CommandGroup>
                  <CommandItem
                    onSelect={() => {
                      setOpen(false);
                      setShowNewWorkspaceDialog(true);
                    }}
                  >
                    <PlusCircledIcon className="mr-2 h-5 w-5" />
                    {t('common:create_new_workspace')}
                  </CommandItem>
                </CommandGroup>
              </DialogTrigger>
            </Command>
          </PopoverContent>
        </Popover>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common:create_workspace')}</DialogTitle>
            <DialogDescription>
              {t('common:create_workspace_description')}
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-2">
              <FormField
                control={form.control}
                name="name"
                disabled={loading}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common:workspace_name')}</FormLabel>
                    <FormControl>
                      <Input placeholder="Acme Inc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="plan"
                disabled={loading}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common:subscription_plan')}</FormLabel>
                    <FormControl>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a plan" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FREE">
                            <span className="font-medium">
                              {t('common:free')}
                            </span>{' '}
                            -{' '}
                            <span className="text-muted-foreground">
                              {t('common:0_usd_per_month')}
                            </span>
                          </SelectItem>
                          <SelectItem value="PRO" disabled>
                            <span className="font-medium">
                              {t('common:pro')}
                            </span>{' '}
                            -{' '}
                            <span className="text-muted-foreground">
                              {t('common:coming_soon')}
                            </span>
                          </SelectItem>
                          <SelectItem value="ENTERPRISE" disabled>
                            <span className="font-medium">
                              {t('common:enterprise')}
                            </span>{' '}
                            -{' '}
                            <span className="text-muted-foreground">
                              {t('common:coming_soon')}
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowNewWorkspaceDialog(false)}
                >
                  {t('common:cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !form.formState.isValid}
                >
                  {t('common:continue')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            aria-label="Online users"
            className="flex flex-none items-center gap-1 px-2"
            disabled={!onlineUsers}
          >
            {onlineUsers && (onlineUsers?.length || 0) > 0 ? (
              onlineUsers.slice(0, 3).map((user) => (
                <div
                  key={user.id}
                  className="hidden items-center gap-2 md:flex"
                >
                  <Avatar className="border-background relative h-6 w-6 overflow-visible border">
                    <AvatarImage
                      src={user?.avatar_url || undefined}
                      alt={
                        user.display_name || user.handle || user.email || '?'
                      }
                      className="overflow-clip rounded-full"
                    />
                    <AvatarFallback className="text-xs font-semibold">
                      {getInitials(
                        user?.display_name || user?.handle || user.email || '?'
                      )}
                    </AvatarFallback>
                    <div
                      className={`border-background absolute bottom-0 right-0 z-20 h-2 w-2 rounded-full border ${
                        isDefault
                          ? 'bg-green-500 dark:bg-green-400'
                          : 'bg-foreground'
                      }`}
                    />
                  </Avatar>
                </div>
              ))
            ) : (
              <LoadingIndicator className="h-6 w-6" />
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
                    className="overflow-clip rounded-full"
                  />
                  <AvatarFallback className="text-sm font-semibold">
                    {getInitials(
                      user?.display_name || user?.handle || user.email || '?'
                    )}
                  </AvatarFallback>
                  <div
                    className={`border-background absolute bottom-0 right-0 z-10 h-3 w-3 rounded-full border-2 ${
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
