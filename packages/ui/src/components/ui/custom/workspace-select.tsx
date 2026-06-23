'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckIcon,
  ChevronDown,
  Link,
  Loader2,
  PlusCircle,
  Star,
} from '@tuturuuu/icons';
import { updateCurrentUserDefaultWorkspace } from '@tuturuuu/internal-api/users';
import {
  acceptWorkspaceInvite,
  getWorkspace,
} from '@tuturuuu/internal-api/workspaces';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  PERSONAL_WORKSPACE_SLUG,
  ROOT_WORKSPACE_ID,
  resolveWorkspaceId,
  toWorkspaceSlug,
} from '@tuturuuu/utils/constants';
import { cn } from '@tuturuuu/utils/format';
import { workspaceHandleSchema } from '@tuturuuu/utils/workspace-handle';
import { WORKSPACE_LIMIT_ERROR_CODE } from '@tuturuuu/utils/workspace-limits';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { useForm } from '../../../hooks/use-form';
import { useWorkspaceUser } from '../../../hooks/use-workspace-user';
import { zodResolver } from '../../../resolvers';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import { Badge } from '../badge';
import { Button } from '../button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '../command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../form';
import { Input } from '../input';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { TUTURUUU_LOGO_URL } from './tuturuuu-logo';
import { mergeWorkspaceSelectWorkspaces } from './workspace-select-helpers';

const FormSchema = z.object({
  name: z.string().min(1).max(100),
});

const JoinWorkspaceByHandleFormSchema = z.object({
  handle: workspaceHandleSchema,
});

function resolveWorkspaceAvatarUrl(
  avatarUrl: string | null | undefined,
  fallbackLogoUrl: string
) {
  return avatarUrl === TUTURUUU_LOGO_URL ? fallbackLogoUrl : avatarUrl;
}

function WorkspaceIcon({
  name,
  avatarUrl,
  className,
  fallbackLogoUrl = TUTURUUU_LOGO_URL,
}: {
  name?: string | null;
  avatarUrl?: string | null;
  className?: string;
  fallbackLogoUrl?: string;
}) {
  const resolvedAvatarUrl = resolveWorkspaceAvatarUrl(
    avatarUrl,
    fallbackLogoUrl
  );
  const shouldSkipFallbackOptimization = /^https?:\/\//u.test(fallbackLogoUrl);

  return (
    <Avatar
      className={cn(
        'h-5 max-h-5 min-h-5 w-5 min-w-5 max-w-5 flex-none overflow-hidden',
        resolvedAvatarUrl ? 'rounded-xs' : 'rounded-sm',
        className
      )}
    >
      <AvatarImage
        src={
          resolvedAvatarUrl ||
          (name ? `https://avatar.vercel.sh/${name}.png` : undefined)
        }
        alt={name || 'Workspace'}
        className={cn(
          'h-full w-full object-cover',
          resolvedAvatarUrl ? 'rounded-xs' : 'rounded-sm'
        )}
      />
      <AvatarFallback
        className={cn(
          'h-full w-full text-xs',
          resolvedAvatarUrl ? 'rounded-xs' : 'rounded-sm'
        )}
      >
        <Image
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
          height={20}
          src={fallbackLogoUrl}
          unoptimized={shouldSkipFallbackOptimization}
          width={20}
        />
      </AvatarFallback>
    </Avatar>
  );
}

export function WorkspaceSelect({
  wsId,
  hideLeading,
  customRedirectSuffix,
  disableCreateNewWorkspace,
  fetchWorkspaces,
  additionalFormFields,
  showTierBadges = true,
  createWorkspaceDescription,
  fallbackLogoUrl = TUTURUUU_LOGO_URL,
  resolveNextPathname,
}: {
  wsId: string;
  hideLeading?: boolean;
  customRedirectSuffix?: string;
  disableCreateNewWorkspace?: boolean;
  fetchWorkspaces: () => Promise<InternalApiWorkspaceSummary[]>;
  additionalFormFields?: ReactNode;
  showTierBadges?: boolean;
  createWorkspaceDescription?: ReactNode;
  fallbackLogoUrl?: string;
  resolveNextPathname?: (context: {
    currentPathname: string;
    nextSlug: string;
  }) => string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const resolvedWorkspaceId =
    wsId && wsId !== PERSONAL_WORKSPACE_SLUG
      ? resolveWorkspaceId(wsId)
      : undefined;
  const { data: listedWorkspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: fetchWorkspaces,
    enabled: !!wsId,
  });
  const hasListedCurrentWorkspace = Boolean(
    resolvedWorkspaceId &&
      listedWorkspaces?.some(
        (workspace) => workspace.id === resolvedWorkspaceId
      )
  );
  const { data: currentWorkspaceFallback } = useQuery({
    queryKey: ['workspace-select-current-workspace', resolvedWorkspaceId],
    queryFn: async () =>
      (await getWorkspace(resolvedWorkspaceId!)) as InternalApiWorkspaceSummary,
    enabled: Boolean(resolvedWorkspaceId && !hasListedCurrentWorkspace),
    retry: 1,
  });
  const workspaces = mergeWorkspaceSelectWorkspaces(
    listedWorkspaces,
    currentWorkspaceFallback
  );
  const { data: currentUser } = useWorkspaceUser();

  const defaultWorkspaceId = currentUser?.default_workspace_id || null;

  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: '',
    },
  });
  const joinByHandleForm = useForm({
    resolver: zodResolver(JoinWorkspaceByHandleFormSchema),
    defaultValues: {
      handle: '',
    },
  });

  const [open, setOpen] = useState(false);
  const [showNewWorkspaceDialog, setShowNewWorkspaceDialog] = useState(false);
  const [showJoinWorkspaceDialog, setShowJoinWorkspaceDialog] = useState(false);

  const [loading, setLoading] = useState(false);
  const [joiningByHandle, setJoiningByHandle] = useState(false);

  const updateDefaultWorkspaceMutation = useMutation({
    mutationFn: (workspaceId: string) =>
      updateCurrentUserDefaultWorkspace(workspaceId),
    onSuccess: (_, workspaceId) => {
      queryClient.setQueryData(
        ['workspace-user'],
        (previous: WorkspaceUser | undefined) =>
          previous
            ? {
                ...previous,
                default_workspace_id: workspaceId,
              }
            : previous
      );

      void queryClient.invalidateQueries({ queryKey: ['workspace-user'] });
      void queryClient.invalidateQueries({ queryKey: ['default-workspace'] });
      void queryClient.invalidateQueries({ queryKey: ['user'] });
      void queryClient.invalidateQueries({ queryKey: ['user-workspaces'] });
      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      router.refresh();
    },
    onError: (error) => {
      console.error('Error updating default workspace:', error);
      toast.error(t('common.error'));
    },
  });

  const getWorkspaceLandingPath = (nextSlug: string) => {
    if (resolveNextPathname) {
      return resolveNextPathname({
        currentPathname: pathname || `/${wsId}`,
        nextSlug,
      });
    }

    return customRedirectSuffix
      ? `/${nextSlug}/${customRedirectSuffix}`
      : `/${nextSlug}`;
  };

  async function onSubmit(formData: z.infer<typeof FormSchema>) {
    if (disableCreateNewWorkspace) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/v1/workspaces/team`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        form.reset();

        const { id } = await res.json();

        router.push(getWorkspaceLandingPath(id));
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

  const personalWorkspace = workspaces?.find(
    (ws) => ws?.personal === true && ws.access_type !== 'guest'
  );
  const rootWorkspace = workspaces?.find(
    (ws) => ws?.id === ROOT_WORKSPACE_ID && ws.access_type !== 'guest'
  );
  const nonPersonalWorkspaces =
    workspaces?.filter(
      (ws) =>
        !ws?.personal &&
        ws?.id !== ROOT_WORKSPACE_ID &&
        ws.access_type !== 'guest'
    ) || [];
  const guestWorkspaces =
    workspaces?.filter((ws) => ws.access_type === 'guest') || [];

  const groups = [
    rootWorkspace && {
      id: 'root',
      label: t('common.system'),
      teams: [
        {
          id: rootWorkspace.id,
          label: rootWorkspace.name || t('common.root'),
          value: ROOT_WORKSPACE_ID,
          avatarUrl:
            resolveWorkspaceAvatarUrl(
              rootWorkspace.avatar_url,
              fallbackLogoUrl
            ) || fallbackLogoUrl,
          tier: rootWorkspace.tier as
            | 'FREE'
            | 'PLUS'
            | 'PRO'
            | 'ENTERPRISE'
            | null,
        },
      ],
    },
    personalWorkspace && {
      id: 'personal',
      label: t('common.personal_account'),
      teams: [
        {
          id: personalWorkspace.id,
          label: personalWorkspace.name || 'Personal',
          value: PERSONAL_WORKSPACE_SLUG,
          avatarUrl: resolveWorkspaceAvatarUrl(
            personalWorkspace.avatar_url,
            fallbackLogoUrl
          ),
          tier: personalWorkspace.tier as
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
        (workspace: InternalApiWorkspaceSummary) => ({
          id: workspace.id,
          label: workspace.name || 'Untitled',
          value: toWorkspaceSlug(workspace.id, {
            personal: workspace?.personal,
          }),
          // Signal creator-owned workspaces for UI
          isCreator: workspace?.created_by_me === true,
          avatarUrl: resolveWorkspaceAvatarUrl(
            workspace.avatar_url,
            fallbackLogoUrl
          ),
          tier: workspace.tier || null,
        })
      ),
    },
    guestWorkspaces.length > 0 && {
      id: 'guest-workspaces',
      label: t('common.guest_workspaces'),
      teams: guestWorkspaces.map((workspace: InternalApiWorkspaceSummary) => ({
        id: workspace.id,
        label: workspace.name || 'Untitled',
        value: toWorkspaceSlug(workspace.id, {
          personal: workspace?.personal,
        }),
        accessType: 'guest' as const,
        avatarUrl: resolveWorkspaceAvatarUrl(
          workspace.avatar_url,
          fallbackLogoUrl
        ),
        guestBoardCount: workspace.guest_board_count ?? 0,
        guestLandingPath: workspace.guest_landing_path ?? '/tasks/boards',
        guestProducts: workspace.guest_products ?? ['tasks'],
        guestPermission: workspace.guest_highest_permission ?? 'view',
        tier: workspace.tier || null,
      })),
    },
  ].filter(Boolean) as {
    id: string;
    label: string;
    teams: {
      id: string;
      label: string;
      value: string | undefined;
      isCreator?: boolean;
      avatarUrl?: string | null;
      accessType?: 'member' | 'guest';
      guestBoardCount?: number;
      guestLandingPath?: string | null;
      guestPermission?: 'view' | 'edit' | null;
      guestProducts?: Array<'tasks'>;
      tier?: 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE' | null;
      isRoot?: boolean;
    }[];
  }[];

  const onValueChange = (nextSlug: string) => {
    const selectedTeam = groups
      .flatMap((group) => group.teams)
      .find((team) => team.value === nextSlug);
    let newPathname =
      selectedTeam?.accessType === 'guest' && selectedTeam.guestLandingPath
        ? `/${nextSlug}${selectedTeam.guestLandingPath}`
        : pathname
          ? (resolveNextPathname?.({
              currentPathname: pathname,
              nextSlug,
            }) ?? pathname.replace(/^\/[^/]+/, `/${nextSlug}`))
          : undefined;
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
      : (workspaces.find((ws) => ws.id === resolvedWorkspaceId) ??
        guestWorkspaces.find((ws) => ws.id === resolvedWorkspaceId));
  if (!wsId) return <div />;

  const hasSelectableWorkspaces = workspaces.length > 0;

  async function onJoinByHandleSubmit(
    formData: z.infer<typeof JoinWorkspaceByHandleFormSchema>
  ) {
    setJoiningByHandle(true);
    const slug = formData.handle.trim().toLowerCase();

    try {
      await acceptWorkspaceInvite(slug);
      toast.success(t('common.join_workspace_success'));
      joinByHandleForm.reset({ handle: '' });
      setShowJoinWorkspaceDialog(false);
      setOpen(false);

      void queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      void queryClient.invalidateQueries({ queryKey: ['user-workspaces'] });
      void queryClient.invalidateQueries({ queryKey: ['workspace-user'] });

      router.push(getWorkspaceLandingPath(slug));
    } catch (error) {
      console.error('Error accepting workspace invite:', error);
      const message =
        error instanceof Error ? error.message : t('common.error');
      toast.error(t('common.error'), { description: message });
    } finally {
      setJoiningByHandle(false);
    }
  }

  return (
    <>
      {hideLeading || wsId === ROOT_WORKSPACE_ID || (
        <div className="mx-1 h-4 w-px flex-none rotate-30 bg-foreground/20" />
      )}
      <Dialog
        open={showJoinWorkspaceDialog}
        onOpenChange={(open) => {
          joinByHandleForm.reset({ handle: '' });
          setShowJoinWorkspaceDialog(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.join_workspace')}</DialogTitle>
            <DialogDescription>
              {t('common.join_workspace_by_slug_description')}
            </DialogDescription>
          </DialogHeader>
          <Form {...joinByHandleForm}>
            <form
              onSubmit={joinByHandleForm.handleSubmit(onJoinByHandleSubmit)}
              className="grid gap-2"
            >
              <FormField
                control={joinByHandleForm.control}
                name="handle"
                disabled={joiningByHandle}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('common.workspace_slug')}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t('common.workspace_slug_placeholder')}
                        {...field}
                        onChange={(event) => {
                          field.onChange(event.target.value.toLowerCase());
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowJoinWorkspaceDialog(false)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={
                    joiningByHandle || !joinByHandleForm.formState.isValid
                  }
                >
                  {t('common.continue')}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={showNewWorkspaceDialog}
        onOpenChange={(open) => {
          form.reset();
          setShowNewWorkspaceDialog(open);
        }}
      >
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild disabled={!hasSelectableWorkspaces}>
            <Button
              size="xs"
              variant="outline"
              aria-expanded={open}
              aria-label="Select a workspace"
              className={cn(
                hideLeading ? 'justify-center p-0' : 'justify-start',
                'w-full whitespace-normal text-start'
              )}
              disabled={!hasSelectableWorkspaces}
            >
              <WorkspaceIcon
                fallbackLogoUrl={fallbackLogoUrl}
                name={workspace?.name}
                avatarUrl={
                  resolveWorkspaceAvatarUrl(
                    workspace?.avatar_url,
                    fallbackLogoUrl
                  ) ||
                  (workspace?.id === ROOT_WORKSPACE_ID
                    ? fallbackLogoUrl
                    : undefined)
                }
              />
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
                {showTierBadges && workspace?.tier !== undefined && (
                  <Badge
                    variant="outline"
                    className={cn(
                      'h-4 shrink-0 px-1 py-0 font-medium text-[10px]',
                      (!workspace?.tier || workspace?.tier === 'FREE') &&
                        'border-muted-foreground/30 bg-muted/50 text-muted-foreground',
                      workspace?.tier === 'PLUS' &&
                        'border-dynamic-blue/50 bg-dynamic-blue/10 text-dynamic-blue',
                      workspace?.tier === 'PRO' &&
                        'border-dynamic-purple/50 bg-dynamic-purple/10 text-dynamic-purple',
                      workspace?.tier === 'ENTERPRISE' &&
                        'border-dynamic-amber/50 bg-dynamic-amber/10 text-dynamic-amber'
                    )}
                  >
                    {workspace?.tier || 'FREE'}
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
                        id: string;
                        label: string;
                        value: string | undefined;
                        isCreator?: boolean;
                        avatarUrl?: string | null;
                        accessType?: 'member' | 'guest';
                        guestBoardCount?: number;
                        guestLandingPath?: string | null;
                        guestPermission?: 'view' | 'edit' | null;
                        guestProducts?: Array<'tasks'>;
                        tier?: 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE' | null;
                        isRoot?: boolean;
                      }) => {
                        const isCurrentWorkspace = wsId === team.value;
                        const isDefaultWorkspace =
                          defaultWorkspaceId === team.id;
                        const isUpdatingDefaultWorkspace =
                          updateDefaultWorkspaceMutation.isPending &&
                          updateDefaultWorkspaceMutation.variables === team.id;

                        return (
                          <CommandItem
                            key={team.value}
                            value={`${team.label} ${team.value || ''}`}
                            onSelect={() => {
                              if (!team?.value || team?.value === wsId) return;
                              onValueChange(team.value);
                              setOpen(false);
                            }}
                            className={cn(
                              'gap-1.5 text-sm',
                              isCurrentWorkspace && 'bg-accent'
                            )}
                            disabled={!team}
                          >
                            <WorkspaceIcon
                              fallbackLogoUrl={fallbackLogoUrl}
                              name={team.label}
                              avatarUrl={team.avatarUrl}
                            />
                            <div className="flex min-w-0 flex-1 items-center gap-1.5">
                              <span className="line-clamp-1 min-w-0 flex-1 text-xs">
                                {team.label}
                              </span>
                              {showTierBadges && (
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
                              )}
                              {team.accessType === 'guest' && (
                                <>
                                  <Badge
                                    variant="outline"
                                    className="h-4 shrink-0 border-dynamic-green/50 bg-dynamic-green/10 px-1 py-0 font-medium text-[10px] text-dynamic-green"
                                  >
                                    {t('common.guest_access')}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className="h-4 shrink-0 border-dynamic-blue/50 bg-dynamic-blue/10 px-1 py-0 font-medium text-[10px] text-dynamic-blue"
                                  >
                                    {t('common.tasks_only')}
                                  </Badge>
                                </>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
                              {team.accessType !== 'guest' && (
                                <Button
                                  type="button"
                                  variant={
                                    isDefaultWorkspace ? 'secondary' : 'ghost'
                                  }
                                  size="xs"
                                  className={cn(
                                    'h-6 w-6 shrink-0 rounded-sm p-0',
                                    isDefaultWorkspace &&
                                      'bg-dynamic-amber/12 text-dynamic-amber hover:bg-dynamic-amber/18 hover:text-dynamic-amber'
                                  )}
                                  aria-label="Default workspace"
                                  title="Default workspace"
                                  disabled={
                                    isDefaultWorkspace ||
                                    isUpdatingDefaultWorkspace ||
                                    updateDefaultWorkspaceMutation.isPending
                                  }
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                  }}
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();

                                    if (
                                      isDefaultWorkspace ||
                                      isUpdatingDefaultWorkspace
                                    ) {
                                      return;
                                    }

                                    updateDefaultWorkspaceMutation.mutate(
                                      team.id
                                    );
                                  }}
                                >
                                  {isUpdatingDefaultWorkspace ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Star
                                      className={cn(
                                        'h-3 w-3',
                                        isDefaultWorkspace && 'fill-current'
                                      )}
                                    />
                                  )}
                                </Button>
                              )}
                              <CheckIcon
                                className={cn(
                                  'h-3.5 w-3.5 shrink-0',
                                  isCurrentWorkspace
                                    ? 'opacity-100'
                                    : 'opacity-0'
                                )}
                              />
                            </div>
                          </CommandItem>
                        );
                      }
                    )}
                  </CommandGroup>
                ))}
              </CommandList>
              <CommandSeparator />
              <CommandGroup
                className={cn(
                  'grid gap-2',
                  disableCreateNewWorkspace ? 'grid-cols-1' : 'grid-cols-2'
                )}
              >
                {!disableCreateNewWorkspace && (
                  <CommandItem
                    className="justify-center"
                    disabled={disableCreateNewWorkspace}
                    onSelect={() => {
                      setOpen(false);
                      setShowNewWorkspaceDialog(true);
                    }}
                  >
                    <PlusCircle className="h-5 w-5" />
                    <span className="truncate">
                      {t('common.create_new_workspace')}
                    </span>
                  </CommandItem>
                )}
                <CommandItem
                  className="justify-center"
                  onSelect={() => {
                    setOpen(false);
                    setShowJoinWorkspaceDialog(true);
                  }}
                >
                  <Link className="h-5 w-5" />
                  <span className="truncate">{t('common.join_workspace')}</span>
                </CommandItem>
              </CommandGroup>
            </Command>
          </PopoverContent>
        </Popover>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('common.create_workspace')}</DialogTitle>
            <DialogDescription asChild>
              {createWorkspaceDescription || (
                <div className="space-y-2">
                  <p>{t('common.create_workspace_description')}</p>
                  <p className="font-semibold text-dynamic-blue">
                    {t('common.create_workspace_upgrade_notice')}
                  </p>
                </div>
              )}
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

              {additionalFormFields}

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
    </>
  );
}
