'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import { Workspace } from '@tuturuuu/types/db';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@tuturuuu/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { toast } from '@tuturuuu/ui/hooks/use-toast';
import { Input } from '@tuturuuu/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { CheckIcon, ChevronDown, PlusCircle } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { z } from 'zod';

const FormSchema = z.object({
  name: z.string().min(1).max(100),
  plan: z.string(),
});

export function WorkspaceSelect({
  t,
  localUseQuery,
  hideLeading,
  customRedirectSuffix,
}: {
  t: any;
  localUseQuery: any;
  hideLeading?: boolean;
  customRedirectSuffix?: string;
}) {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();

  const wsId = params.wsId as string | undefined;

  const workspacesQuery = localUseQuery({
    queryKey: ['workspaces'],
    queryFn: fetchWorkspaces,
    enabled: !!wsId,
  });

  const workspaces = workspacesQuery.data;

  const form = useForm({
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

      customRedirectSuffix
        ? router.push(`/${id}/${customRedirectSuffix}`)
        : router.push(`/${id}`);
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
    // {
    //   id: 'personal',
    //   label: t('common.personal_account'),
    //   teams: [
    //     {
    //       label:
    //         user?.display_name || user?.handle || user?.email || 'Personal',
    //       value: user?.id,
    //     },
    //   ],
    // },
    {
      id: 'workspaces',
      label: t('common.workspaces'),
      teams:
        workspaces?.map((workspace: Workspace) => ({
          label: workspace.name || 'Untitled',
          value: workspace.id,
        })) || [],
    },
  ];

  const onValueChange = (wsId: string) => {
    let newPathname = pathname?.replace(/^\/[^/]+/, `/${wsId}`);
    if (newPathname) {
      // Regex to match a UUID at the end of the string, with or without dashes
      const uuidRegex =
        /\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{32})$/;
      // Remove the UUID if present, and the current path is not /:wsId
      if (uuidRegex.test(newPathname) && newPathname !== `/${wsId}`)
        newPathname = newPathname.replace(uuidRegex, '');
      router.push(newPathname);
    }
  };

  const workspace = workspaces?.find((ws: Workspace) => ws.id === wsId);

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

  if (!wsId) return <div />;

  return (
    <>
      {hideLeading || (
        <div className="mx-1 h-4 w-px flex-none rotate-30 bg-foreground/20" />
      )}
      <Dialog
        open={showNewWorkspaceDialog}
        onOpenChange={(open) => {
          form.reset();
          setShowNewWorkspaceDialog(open);
        }}
      >
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            asChild
            disabled={!workspaces || workspaces.length === 0}
          >
            <Button
              size="xs"
              variant="outline"
              role="combobox"
              aria-expanded={open}
              aria-label="Select a workspace"
              className={cn(
                hideLeading ? 'justify-center p-0' : 'justify-start',
                'w-full text-start whitespace-normal'
              )}
              disabled={!workspaces || workspaces.length === 0}
            >
              <Avatar
                className={cn(hideLeading || 'mr-2', 'h-5 w-5 flex-none')}
              >
                <AvatarImage
                  src={
                    workspace?.name
                      ? `https://avatar.vercel.sh/${workspace.name}.png`
                      : undefined
                  }
                  alt={workspace?.name || 'Workspace'}
                />
                <AvatarFallback>
                  {workspace?.name ? getInitials(workspace.name) : '?'}
                </AvatarFallback>
              </Avatar>
              <div className={cn(hideLeading ? 'hidden' : 'w-full')}>
                <span className="line-clamp-1 w-full break-all">
                  {workspace?.name || t('common.loading') + '...'}
                </span>
              </div>
              {hideLeading || (
                <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full max-w-[16rem] p-0">
            <Command>
              <CommandInput placeholder="Search workspace..." />
              <CommandEmpty>No workspace found.</CommandEmpty>
              <CommandList className="max-h-64">
                {groups.map((group) => (
                  <CommandGroup key={group.label} heading={group.label}>
                    {group.teams.map((team: any) => (
                      <CommandItem
                        key={team.value}
                        onSelect={() => {
                          if (!team?.value || team?.value === wsId) return;
                          onValueChange(team.value);
                          setOpen(false);
                        }}
                        className={`text-sm ${
                          group.id === 'personal' ? 'opacity-50' : ''
                        }`}
                        disabled={!team || group.id === 'personal'}
                      >
                        <Avatar className="mr-2 h-5 w-5">
                          <AvatarImage
                            src={`https://avatar.vercel.sh/${team.label}.png`}
                            alt={team.label}
                            className="grayscale"
                          />
                          <AvatarFallback>
                            {getInitials(team.label)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="line-clamp-1">{team.label}</span>
                        {group.id !== 'personal' && (
                          <CheckIcon
                            className={cn(
                              'ml-auto h-4 w-4',
                              wsId === team.value ? 'opacity-100' : 'opacity-0'
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
                    <PlusCircle className="mr-2 h-5 w-5" />
                    {t('common.create_new_workspace')}
                  </CommandItem>
                </CommandGroup>
              </DialogTrigger>
            </Command>
          </PopoverContent>
        </Popover>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.create_workspace')}</DialogTitle>
            <DialogDescription>
              {t('common.create_workspace_description')}
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
                    <FormLabel>{t('common.workspace_name')}</FormLabel>
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
                    <FormLabel>{t('common.subscription_plan')}</FormLabel>
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
                              {t('common.free')}
                            </span>{' '}
                            -{' '}
                            <span className="text-muted-foreground">
                              {t('common.0_usd_per_month')}
                            </span>
                          </SelectItem>
                          <SelectItem value="PRO" disabled>
                            <span className="font-medium">
                              {t('common.pro')}
                            </span>{' '}
                            -{' '}
                            <span className="text-muted-foreground">
                              {t('common.coming_soon')}
                            </span>
                          </SelectItem>
                          <SelectItem value="ENTERPRISE" disabled>
                            <span className="font-medium">
                              {t('common.enterprise')}
                            </span>{' '}
                            -{' '}
                            <span className="text-muted-foreground">
                              {t('common.coming_soon')}
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
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !form.formState.isValid}
                >
                  {t('common.continue')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            aria-label="Online users"
            className="flex flex-none items-center gap-1 px-2"
            disabled={!onlineUsers}
          >
            {user?.id || (onlineUsers && (onlineUsers?.length || 0) > 0) ? (
              (onlineUsers ? onlineUsers : user?.id ? [user] : [])
                .slice(0, 3)
                .map((user) => (
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
                          user?.display_name ||
                            user?.handle ||
                            user.email ||
                            '?'
                        )}
                      </AvatarFallback>
                      <UserPresenceIndicator />
                    </Avatar>
                  </div>
                ))
            ) : (
              <LoadingIndicator className="h-6 w-6" />
            )}

            {onlineUsers && (
              <div className="flex items-center gap-2 font-semibold md:hidden">
                <div>{onlineUsers.length || 0}</div>
                <div className="relative flex items-center">
                  <UserPresenceIndicator className="relative h-2.5 w-2.5" />
                  <UserPresenceIndicator className="h-2.5 w-2.5 animate-ping" />
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
              {t('common.currently_online')} ({onlineUsers?.length || 0})
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
                  <div className="absolute bottom-0 right-0 flex items-center">
                    <UserPresenceIndicator className="relative h-2.5 w-2.5" />
                    <UserPresenceIndicator className="h-2.5 w-2.5 animate-ping" />
                  </div>
                </Avatar>
                <span className="line-clamp-1">
                  {user.display_name ||
                    user.handle ||
                    user.email ||
                    t('common.unknown')}
                </span>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover> */}
    </>
  );
}

async function fetchWorkspaces() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data: workspaces, error: error } = await supabase
    .from('workspaces')
    .select(
      'id, name, avatar_url, logo_url, created_at, workspace_members!inner(role)'
    )
    .eq('workspace_members.user_id', user.id);

  if (error) return [];
  return workspaces;
}
