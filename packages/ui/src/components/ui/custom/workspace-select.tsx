'use client';

import { CheckIcon, ChevronDown, PlusCircle } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { Workspace } from '@tuturuuu/types';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
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
import { toast } from '@tuturuuu/ui/sonner';
import {
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
  toWorkspaceSlug,
} from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { WORKSPACE_LIMIT_ERROR_CODE } from '@tuturuuu/utils/workspace-limits';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';

const FormSchema = z.object({
  name: z.string().min(1).max(100),
  plan: z.string(),
});

export function WorkspaceSelect({
  t,
  wsId,
  localUseQuery,
  hideLeading,
  customRedirectSuffix,
  disableCreateNewWorkspace,
}: {
  t: any;
  wsId: string;
  localUseQuery: any;
  hideLeading?: boolean;
  customRedirectSuffix?: string;
  disableCreateNewWorkspace?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const workspacesQuery = localUseQuery({
    queryKey: ['workspaces'],
    queryFn: fetchWorkspaces,
    enabled: !!wsId,
  });

  const workspaces = (workspacesQuery?.data || []) as Workspace[];

  const resolvedWorkspaceId =
    wsId && wsId !== PERSONAL_WORKSPACE_SLUG
      ? resolveWorkspaceId(wsId)
      : undefined;

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
    if (disableCreateNewWorkspace) return;
    setLoading(true);

    try {
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

        if (customRedirectSuffix) router.push(`/${id}/${customRedirectSuffix}`);
        else router.push(`/${id}`);
        router.refresh();

        setShowNewWorkspaceDialog(false);
        setLoading(false);
        setOpen(false);
      } else {
        const errorData = await res.json();

        // Check if it's a workspace limit error
        if (
          res.status === 403 &&
          errorData.code === WORKSPACE_LIMIT_ERROR_CODE
        ) {
          toast.error(t('common.workspace_limit_reached'), {
            description: errorData.message,
          });
        } else {
          toast.error(t('common.error_creating_workspace'), {
            description:
              errorData.message || t('common.workspace_creation_failed'),
          });
        }

        setLoading(false);
      }
    } catch (error) {
      console.error('Error creating workspace:', error);
      toast.error(t('common.error_creating_workspace'), {
        description: t('common.workspace_creation_failed'),
      });
      setLoading(false);
    }
  }

  const personalWorkspace = workspaces?.find((ws) => ws?.personal === true);
  const nonPersonalWorkspaces = workspaces?.filter((ws) => !ws?.personal) || [];

  const groups = [
    personalWorkspace && {
      id: 'personal',
      label: t('common.personal_account'),
      teams: [
        {
          label: personalWorkspace.name || 'Personal',
          value: PERSONAL_WORKSPACE_SLUG,
          avatarUrl: personalWorkspace.avatar_url,
          tier: (personalWorkspace as any)?.tier as
            | 'FREE'
            | 'PLUS'
            | 'PRO'
            | 'ENTERPRISE'
            | null,
        },
      ],
    },
    nonPersonalWorkspaces.length > 0 && {
      id: 'workspaces',
      label: t('common.workspaces'),
      teams: nonPersonalWorkspaces.map(
        (workspace: {
          id: string;
          name: string | null;
          created_by_me?: boolean;
          personal?: boolean;
          avatar_url?: string | null;
          tier?: 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE' | null;
        }) => ({
          label: workspace.name || 'Untitled',
          value: toWorkspaceSlug(workspace.id, {
            personal: workspace?.personal,
          }),
          // Signal creator-owned workspaces for UI
          isCreator: workspace?.created_by_me === true,
          avatarUrl: workspace.avatar_url,
          tier: workspace.tier || null,
        })
      ),
    },
  ].filter(Boolean) as {
    id: string;
    label: string;
    teams: {
      label: string;
      value: string | undefined;
      isCreator?: boolean;
      avatarUrl?: string | null;
      tier?: 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE' | null;
    }[];
  }[];

  const onValueChange = (nextSlug: string) => {
    let newPathname = pathname?.replace(/^\/[^/]+/, `/${nextSlug}`);
    if (newPathname) {
      // Regex to match a UUID at the end of the string, with or without dashes
      const uuidRegex =
        /\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{32})$/;
      // Remove the UUID if present, and the current path is not /:wsId
      if (uuidRegex.test(newPathname) && newPathname !== `/${nextSlug}`)
        newPathname = newPathname.replace(uuidRegex, '');
      router.push(newPathname);
    }
  };

  const workspace =
    wsId === PERSONAL_WORKSPACE_SLUG
      ? personalWorkspace
      : workspaces?.find((ws: { id: string }) => ws.id === resolvedWorkspaceId);
  if (!wsId) return <div />;

  return (
    <>
      {hideLeading || wsId === ROOT_WORKSPACE_ID || (
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
              aria-expanded={open}
              aria-label="Select a workspace"
              className={cn(
                hideLeading ? 'justify-center p-0' : 'justify-start',
                'w-full whitespace-normal text-start'
              )}
              disabled={!workspaces || workspaces.length === 0}
            >
              <Avatar
                className={cn(
                  'h-5 w-5 flex-none',
                  workspace?.avatar_url ? 'rounded-xs' : 'rounded-sm'
                )}
              >
                <AvatarImage
                  src={
                    workspace?.avatar_url ||
                    (workspace?.name
                      ? `https://avatar.vercel.sh/${workspace.name}.png`
                      : undefined)
                  }
                  alt={workspace?.name || 'Workspace'}
                  className={
                    workspace?.avatar_url ? 'rounded-xs' : 'rounded-sm'
                  }
                />
                <AvatarFallback
                  className={cn(
                    'text-xs',
                    workspace?.avatar_url ? 'rounded-xs' : 'rounded-sm'
                  )}
                >
                  {workspace?.name ? getInitials(workspace.name) : '?'}
                </AvatarFallback>
              </Avatar>
              <div
                className={cn(
                  hideLeading
                    ? 'hidden'
                    : 'flex min-w-0 flex-1 items-center gap-1.5'
                )}
              >
                <span className="line-clamp-1 min-w-0 flex-1 break-all text-xs">
                  {workspace?.name || `${t('common.loading')}...`}
                </span>
                {(workspace as any)?.tier !== undefined && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'h-4 shrink-0 px-1 py-0 font-medium text-[10px]',
                      (!(workspace as any)?.tier ||
                        (workspace as any)?.tier === 'FREE') &&
                        'border-muted-foreground/30 bg-muted/50 text-muted-foreground',
                      (workspace as any)?.tier === 'PLUS' &&
                        'border-dynamic-blue/50 bg-dynamic-blue/10 text-dynamic-blue',
                      (workspace as any)?.tier === 'PRO' &&
                        'border-dynamic-purple/50 bg-dynamic-purple/10 text-dynamic-purple',
                      (workspace as any)?.tier === 'ENTERPRISE' &&
                        'border-dynamic-amber/50 bg-dynamic-amber/10 text-dynamic-amber'
                    )}
                  >
                    {(workspace as any)?.tier || 'FREE'}
                  </Badge>
                )}
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
                    {group.teams.map(
                      (team: {
                        label: string;
                        value: string | undefined;
                        isCreator?: boolean;
                        avatarUrl?: string | null;
                        tier?: 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE' | null;
                      }) => (
                        <CommandItem
                          key={team.value}
                          value={`${team.label} ${team.value || ''}`}
                          onSelect={() => {
                            if (!team?.value || team?.value === wsId) return;
                            onValueChange(team.value);
                            setOpen(false);
                          }}
                          className={cn(
                            'text-sm',
                            wsId === team.value && 'bg-accent'
                          )}
                          disabled={!team}
                        >
                          <Avatar
                            className={cn(
                              'h-5 w-5',
                              team.avatarUrl ? 'rounded-xs' : 'rounded-sm'
                            )}
                          >
                            <AvatarImage
                              src={
                                team.avatarUrl ||
                                `https://avatar.vercel.sh/${team.label}.png`
                              }
                              alt={team.label}
                              className={
                                team.avatarUrl ? 'rounded-xs' : 'rounded-sm'
                              }
                            />
                            <AvatarFallback
                              className={cn(
                                'text-xs',
                                team.avatarUrl ? '' : 'rounded-sm'
                              )}
                            >
                              {getInitials(team.label)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="line-clamp-1 text-xs">
                            {team.label}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              'h-4 shrink-0 px-1 py-0 font-medium text-[10px]',
                              (!team.tier || team.tier === 'FREE') &&
                                'border-muted-foreground/30 bg-muted/50 text-muted-foreground',
                              team.tier === 'PLUS' &&
                                'border-dynamic-blue/50 bg-dynamic-blue/10 text-dynamic-blue',
                              team.tier === 'PRO' &&
                                'border-dynamic-purple/50 bg-dynamic-purple/10 text-dynamic-purple',
                              team.tier === 'ENTERPRISE' &&
                                'border-dynamic-amber/50 bg-dynamic-amber/10 text-dynamic-amber'
                            )}
                          >
                            {team.tier || 'FREE'}
                          </Badge>
                          <CheckIcon
                            className={cn(
                              'ml-auto h-4 w-4',
                              wsId === team.value ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                        </CommandItem>
                      )
                    )}
                  </CommandGroup>
                ))}
              </CommandList>
              {!disableCreateNewWorkspace && (
                <>
                  <CommandSeparator />
                  <DialogTrigger asChild>
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => {
                          setOpen(false);
                          setShowNewWorkspaceDialog(true);
                        }}
                        disabled={disableCreateNewWorkspace}
                      >
                        <PlusCircle className="h-5 w-5" />
                        {t('common.create_new_workspace')}
                      </CommandItem>
                    </CommandGroup>
                  </DialogTrigger>
                </>
              )}
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

  const { data: workspaces, error } = await supabase
    .from('workspaces')
    .select(
      'id, name, personal, avatar_url, logo_url, created_at, creator_id, workspace_members!inner(user_id), workspace_subscriptions(workspace_subscription_products(tier))'
    )
    .eq('workspace_members.user_id', user.id);

  if (error) return [];

  // Resolve the display label and avatar for personal workspaces using the current user's profile
  const [publicProfileRes, privateDetailsRes] = await Promise.all([
    supabase
      .from('users')
      .select('display_name, handle, avatar_url')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('user_private_details')
      .select('email')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  const publicProfile = publicProfileRes?.data as
    | {
        display_name: string | null;
        handle: string | null;
        avatar_url: string | null;
      }
    | null
    | undefined;
  const privateDetails = privateDetailsRes?.data as
    | { email: string | null }
    | null
    | undefined;

  const displayLabel: string | undefined =
    publicProfile?.display_name ||
    publicProfile?.handle ||
    privateDetails?.email ||
    undefined;

  const userAvatarUrl = publicProfile?.avatar_url || null;

  // For personal workspaces, override the name and avatar with the user's data
  return (workspaces || []).map((ws) => {
    // Extract tier from workspace subscription
    const subscriptions = (ws as any)?.workspace_subscriptions as
      | Array<{
          workspace_subscription_products: {
            tier: 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE' | null;
          } | null;
        }>
      | undefined;
    const tier =
      subscriptions?.[0]?.workspace_subscription_products?.tier || null;

    const base = ws?.personal
      ? {
          ...ws,
          name: displayLabel || ws.name || 'Personal',
          avatar_url: userAvatarUrl || ws.avatar_url,
        }
      : ws;
    return {
      ...base,
      // Mark if current user is the creator for downstream UI
      created_by_me: base?.creator_id === user.id,
      // Include tier information
      tier,
    };
  });
}
