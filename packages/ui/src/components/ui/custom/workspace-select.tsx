'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  CheckIcon,
  ChevronDown,
  Link,
  Loader2,
  Mail,
  PlusCircle,
  Star,
  X,
} from '@tuturuuu/icons';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { updateCurrentUserDefaultWorkspace } from '@tuturuuu/internal-api/users';
import type { WorkspaceInvitationRecord } from '@tuturuuu/internal-api/workspaces';
import {
  acceptWorkspaceInvite,
  createTeamWorkspace,
  declineWorkspaceInvite,
  getWorkspace,
  listWorkspaceInvitations,
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
import { useLocale, useTranslations } from 'next-intl';
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
import {
  buildWorkspaceSetupHandoffUrl,
  mergeWorkspaceSelectWorkspaces,
  normalizeWorkspaceSwitchPath,
  resolveWorkspaceAvatarUrl,
} from './workspace-select-helpers';
import { useOpenWorkspaceSelectWhenRevealed } from './workspace-select-reveal';

const FormSchema = z.object({
  name: z.string().min(1).max(100),
});

const JoinWorkspaceByHandleFormSchema = z.object({
  handle: workspaceHandleSchema,
});

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
  const resolvedAvatarUrl = resolveWorkspaceAvatarUrl(avatarUrl);
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
  standalone,
  customRedirectSuffix,
  disableCreateNewWorkspace,
  fetchWorkspaces,
  additionalFormFields,
  showTierBadges = true,
  createWorkspaceDescription,
  fallbackLogoUrl = TUTURUUU_LOGO_URL,
  resolveNextPathname,
  triggerClassName,
  popoverModal = false,
  platformWorkspaceSetupUrl,
}: {
  wsId: string;
  hideLeading?: boolean;
  standalone?: boolean;
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
  triggerClassName?: string;
  /** Keep the picker interactive and scrollable when rendered inside a modal. */
  popoverModal?: boolean;
  /** Platform origin used to prepare a newly created satellite workspace. */
  platformWorkspaceSetupUrl?: string;
}) {
  const t = useTranslations();
  const locale = useLocale();
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
  const invitationsQuery = useQuery({
    queryKey: ['workspace-invitations'],
    queryFn: async () => (await listWorkspaceInvitations()).invitations,
    retry: 1,
  });
  const invitations = invitationsQuery.data ?? [];

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

  const invitationMutation = useMutation({
    mutationFn: async ({
      action,
      invitation,
    }: {
      action: 'accept' | 'decline';
      invitation: WorkspaceInvitationRecord;
    }) => {
      if (action === 'accept') {
        await acceptWorkspaceInvite(invitation.workspace.id);
      } else {
        await declineWorkspaceInvite(invitation.workspace.id);
      }
      return { action, invitation };
    },
    onSuccess: async ({ action, invitation }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workspace-invitations'] }),
        queryClient.invalidateQueries({ queryKey: ['workspaces'] }),
        queryClient.invalidateQueries({ queryKey: ['user-workspaces'] }),
        queryClient.invalidateQueries({ queryKey: ['workspace-user'] }),
        queryClient.invalidateQueries({ queryKey: ['current-user'] }),
        queryClient.invalidateQueries({ queryKey: ['user'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      ]);

      if (action === 'accept') {
        toast.success(t('workspace-invitation.accept-success'));
        setOpen(false);
        const slug = invitation.workspace.handle || invitation.workspace.id;
        router.push(getWorkspaceLandingPath(slug));
        router.refresh();
      } else {
        toast.success(t('workspace-invitation.decline-success'));
        router.refresh();
      }
    },
    onError: (_error, { action }) => {
      toast.error(
        t(
          action === 'accept'
            ? 'workspace-invitation.accept-error'
            : 'workspace-invitation.decline-error'
        )
      );
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
      const { id } = await createTeamWorkspace(formData);
      const workspaceLandingPath = getWorkspaceLandingPath(id);
      form.reset();
      setShowNewWorkspaceDialog(false);
      setOpen(false);

      if (platformWorkspaceSetupUrl) {
        window.location.assign(
          buildWorkspaceSetupHandoffUrl({
            locale,
            platformUrl: platformWorkspaceSetupUrl,
            returnOrigin: window.location.origin,
            returnPath: workspaceLandingPath,
            workspaceId: id,
          })
        );
        return;
      }

      router.push(workspaceLandingPath);
      router.refresh();
    } catch (error) {
      console.error('Error creating workspace:', error);
      if (
        error instanceof InternalApiError &&
        error.status === 403 &&
        error.code === WORKSPACE_LIMIT_ERROR_CODE
      ) {
        toast.error(t('common.workspace_limit_reached'), {
          description: error.message,
        });
      } else {
        toast.error(t('common.error_creating_workspace'), {
          description:
            error instanceof Error
              ? error.message
              : t('common.workspace_creation_failed'),
        });
      }
    } finally {
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
          avatarUrl: resolveWorkspaceAvatarUrl(rootWorkspace.avatar_url, {
            rootWorkspaceLogoUrl: TUTURUUU_LOGO_URL,
          }),
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
          avatarUrl: resolveWorkspaceAvatarUrl(personalWorkspace.avatar_url),
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
          avatarUrl: resolveWorkspaceAvatarUrl(workspace.avatar_url),
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
        avatarUrl: resolveWorkspaceAvatarUrl(workspace.avatar_url),
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
    const usesGuestLandingPath =
      selectedTeam?.accessType === 'guest' && selectedTeam.guestLandingPath;
    let newPathname = usesGuestLandingPath
      ? `/${nextSlug}${selectedTeam.guestLandingPath}`
      : pathname
        ? (resolveNextPathname?.({
            currentPathname: pathname,
            nextSlug,
          }) ?? pathname.replace(/^\/[^/]+/, `/${nextSlug}`))
        : undefined;
    if (newPathname && !usesGuestLandingPath) {
      newPathname = normalizeWorkspaceSwitchPath(newPathname, nextSlug);
    }
    if (newPathname) {
      router.push(newPathname);
    }
  };

  const hasSelectableWorkspaces =
    workspaces.length > 0 || invitations.length > 0;
  useOpenWorkspaceSelectWhenRevealed(hasSelectableWorkspaces, setOpen);

  const workspace =
    wsId === PERSONAL_WORKSPACE_SLUG
      ? personalWorkspace
      : (workspaces.find((ws) => ws.id === resolvedWorkspaceId) ??
        guestWorkspaces.find((ws) => ws.id === resolvedWorkspaceId));
  if (!wsId) return <div />;

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
      {hideLeading || standalone || wsId === ROOT_WORKSPACE_ID || (
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
        <Popover modal={popoverModal} open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild disabled={!hasSelectableWorkspaces}>
            <Button
              size="xs"
              variant="outline"
              aria-expanded={open}
              aria-label="Select a workspace"
              className={cn(
                hideLeading ? 'justify-center p-0' : 'justify-start',
                'w-full whitespace-normal text-start',
                triggerClassName
              )}
              disabled={!hasSelectableWorkspaces}
            >
              <WorkspaceIcon
                fallbackLogoUrl={fallbackLogoUrl}
                name={workspace?.name}
                avatarUrl={
                  resolveWorkspaceAvatarUrl(workspace?.avatar_url, {
                    rootWorkspaceLogoUrl:
                      workspace?.id === ROOT_WORKSPACE_ID
                        ? TUTURUUU_LOGO_URL
                        : undefined,
                  }) ?? undefined
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
              {invitations.length > 0 && (
                <Badge
                  aria-label={`${invitations.length} ${t('workspace-invitation.list-eyebrow')}`}
                  className="h-5 min-w-5 justify-center px-1 text-[10px]"
                  variant="destructive"
                >
                  {invitations.length > 99 ? '99+' : invitations.length}
                </Badge>
              )}
              {hideLeading || (
                <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full max-w-[16rem] p-0">
            <Command>
              <CommandInput autoFocus placeholder="Search workspace..." />
              <CommandEmpty>No workspace found.</CommandEmpty>
              <CommandList className="max-h-64">
                {invitations.length > 0 && (
                  <CommandGroup
                    heading={`${t('workspace-invitation.list-eyebrow')} (${invitations.length})`}
                  >
                    {invitations.map((invitation) => {
                      const workspaceName =
                        invitation.workspace.name ||
                        invitation.workspace.handle ||
                        invitation.workspace.id;
                      const isPending =
                        invitationMutation.isPending &&
                        invitationMutation.variables?.invitation.workspace
                          .id === invitation.workspace.id;

                      return (
                        <CommandItem
                          className="gap-2"
                          disabled={isPending}
                          key={`${invitation.workspace.id}-${invitation.source}`}
                          value={`${workspaceName} ${invitation.workspace.handle || ''} ${invitation.source} ${invitation.type}`}
                          onSelect={() => undefined}
                        >
                          <WorkspaceIcon
                            avatarUrl={
                              invitation.workspace.avatar_url ||
                              invitation.workspace.logo_url
                            }
                            fallbackLogoUrl={fallbackLogoUrl}
                            name={workspaceName}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs">
                              {workspaceName}
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Mail className="size-3" />
                              {t(
                                `workspace-invitation.${
                                  invitation.source === 'email'
                                    ? 'email-invite'
                                    : 'direct-invite'
                                }`
                              )}
                              <span aria-hidden="true">·</span>
                              {invitation.type === 'GUEST'
                                ? t('common.guest_access')
                                : t('common.members')}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              aria-label={t('workspace-invitation.reject')}
                              disabled={isPending}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                invitationMutation.mutate({
                                  action: 'decline',
                                  invitation,
                                });
                              }}
                              onMouseDown={(event) => event.preventDefault()}
                              size="icon"
                              title={t('workspace-invitation.reject')}
                              type="button"
                              variant="ghost"
                              className="size-7"
                            >
                              {isPending &&
                              invitationMutation.variables?.action ===
                                'decline' ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <X className="size-3.5" />
                              )}
                            </Button>
                            <Button
                              aria-label={t('workspace-invitation.accept')}
                              disabled={isPending}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                invitationMutation.mutate({
                                  action: 'accept',
                                  invitation,
                                });
                              }}
                              onMouseDown={(event) => event.preventDefault()}
                              size="icon"
                              title={t('workspace-invitation.accept')}
                              type="button"
                              className="size-7"
                            >
                              {isPending &&
                              invitationMutation.variables?.action ===
                                'accept' ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Check className="size-3.5" />
                              )}
                            </Button>
                          </div>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                )}
                {invitationsQuery.isError && (
                  <CommandGroup>
                    <CommandItem
                      onSelect={() => invitationsQuery.refetch()}
                      value="retry workspace invitations"
                    >
                      <Loader2
                        className={cn(
                          'size-4',
                          invitationsQuery.isFetching && 'animate-spin'
                        )}
                      />
                      {t.has('common.retry') ? t('common.retry') : 'Retry'}
                    </CommandItem>
                  </CommandGroup>
                )}
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
                  '[&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:gap-1',
                  disableCreateNewWorkspace
                    ? '[&_[cmdk-group-items]]:grid-cols-1'
                    : '[&_[cmdk-group-items]]:grid-cols-2'
                )}
              >
                {!disableCreateNewWorkspace && (
                  <CommandItem
                    className="h-9 justify-center gap-1.5 px-2"
                    disabled={disableCreateNewWorkspace}
                    onSelect={() => {
                      setOpen(false);
                      setShowNewWorkspaceDialog(true);
                    }}
                  >
                    <PlusCircle className="size-4" />
                    <span>{t('common.create_workspace_action')}</span>
                  </CommandItem>
                )}
                <CommandItem
                  className="h-9 justify-center gap-1.5 px-2"
                  onSelect={() => {
                    setOpen(false);
                    setShowJoinWorkspaceDialog(true);
                  }}
                >
                  <Link className="size-4" />
                  <span>{t('common.join_workspace_action')}</span>
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
