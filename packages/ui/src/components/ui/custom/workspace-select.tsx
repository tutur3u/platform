'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from '@tuturuuu/icons';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { updateCurrentUserDefaultWorkspace } from '@tuturuuu/internal-api/users';
import {
  acceptWorkspaceInvite,
  createTeamWorkspace,
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
import { usePathname, useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { useForm } from '../../../hooks/use-form';
import { useWorkspaceUser } from '../../../hooks/use-workspace-user';
import {
  useWorkspaceActor,
  useWorkspaceVisibility,
} from '../../../hooks/use-workspace-visibility';
import { zodResolver } from '../../../resolvers';
import { Badge } from '../badge';
import { Button } from '../button';
import { Command } from '../command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Popover, PopoverTrigger } from '../popover';
import { TUTURUUU_LOGO_URL } from './tuturuuu-logo';
import { WorkspacePickerContent } from './workspace-picker-content';
import {
  buildWorkspaceSetupHandoffUrl,
  mergeWorkspaceSelectWorkspaces,
  normalizeWorkspaceSwitchPath,
  resolveGuestWorkspaceLanding,
  resolveWorkspaceAvatarUrl,
} from './workspace-select-helpers';
import { WorkspaceIcon } from './workspace-select-icon';
import {
  useWorkspaceInvitations,
  WorkspaceInvitationItems,
} from './workspace-select-invitations';
import { useOpenWorkspaceSelectWhenRevealed } from './workspace-select-reveal';

const FormSchema = z.object({
  name: z.string().min(1).max(100),
});

const JoinWorkspaceByHandleFormSchema = z.object({
  handle: workspaceHandleSchema,
});

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
  platformWorkspaceSetupUrl,
  cacheScope,
  presentation = 'dropdown',
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
  /** Platform origin used to prepare a newly created satellite workspace. */
  platformWorkspaceSetupUrl?: string;
  /** Authenticated identity used to isolate user-specific picker caches. */
  cacheScope?: string;
  presentation?: 'fullscreen' | 'dropdown';
}) {
  const Picker = presentation === 'dropdown' ? Popover : Dialog;
  const PickerTrigger =
    presentation === 'dropdown' ? PopoverTrigger : DialogTrigger;
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const actorScope = useWorkspaceActor();
  const visibility = useWorkspaceVisibility();
  const actorId = actorScope?.actorId ?? cacheScope;
  const resolvedWorkspaceId =
    wsId && wsId !== PERSONAL_WORKSPACE_SLUG
      ? resolveWorkspaceId(wsId)
      : undefined;
  const { data: listedWorkspaces } = useQuery({
    queryKey: ['workspace-ui-list', actorId],
    queryFn: async () => {
      actorScope?.assertActive();
      const result = await fetchWorkspaces();
      actorScope?.assertActive();
      return result;
    },
    enabled: Boolean(wsId && actorId),
  });
  const hasListedCurrentWorkspace = Boolean(
    resolvedWorkspaceId &&
      listedWorkspaces?.some(
        (workspace) => workspace.id === resolvedWorkspaceId
      )
  );
  const { data: currentWorkspaceFallback } = useQuery({
    queryKey: [
      'workspace-select-current-workspace',
      actorId,
      resolvedWorkspaceId,
    ],
    queryFn: async () =>
      (await getWorkspace(resolvedWorkspaceId!)) as InternalApiWorkspaceSummary,
    enabled: Boolean(
      actorId && resolvedWorkspaceId && !hasListedCurrentWorkspace
    ),
    retry: 1,
  });
  const workspaces = mergeWorkspaceSelectWorkspaces(
    listedWorkspaces,
    currentWorkspaceFallback
  );
  const { data: currentUser } = useWorkspaceUser(actorId);
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
  const invitationController = useWorkspaceInvitations({
    cacheScope: actorId,
    enabled: Boolean(wsId && actorId),
    onAccepted: (invitation) => {
      setOpen(false);
      const slug = invitation.workspace.handle || invitation.workspace.id;
      router.push(getWorkspaceLandingPath(slug));
      router.refresh();
    },
    onDeclined: () => router.refresh(),
  });
  const invitations = invitationController.invitations;

  const updateDefaultWorkspaceMutation = useMutation({
    mutationFn: (workspaceId: string) =>
      updateCurrentUserDefaultWorkspace(workspaceId),
    onSuccess: (_, workspaceId) => {
      queryClient.setQueryData(
        ['workspace-user', ...(actorId ? [actorId] : [])],
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
      void queryClient.invalidateQueries({
        queryKey: ['workspace-ui-list', actorId],
      });
      router.refresh();
    },
    onError: (error) => {
      console.error('Error updating default workspace:', error);
      toast.error(t('common.error'));
    },
  });

  function getWorkspaceLandingPath(nextSlug: string) {
    if (resolveNextPathname) {
      return resolveNextPathname({
        currentPathname: pathname || `/${wsId}`,
        nextSlug,
      });
    }

    return customRedirectSuffix
      ? `/${nextSlug}/${customRedirectSuffix}`
      : `/${nextSlug}`;
  }

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

  const personalWorkspace = workspaces.find(
    (ws) => ws.personal && ws.access_type !== 'guest'
  );
  const hasSelectableWorkspaces =
    workspaces.length > 0 || invitations.length > 0;
  useOpenWorkspaceSelectWhenRevealed(hasSelectableWorkspaces, setOpen);
  const onValueChange = (selected: InternalApiWorkspaceSummary) => {
    const nextSlug = toWorkspaceSlug(selected.id, {
      personal: selected.personal,
    });
    const guestLanding = resolveGuestWorkspaceLanding(selected);
    let nextPath = guestLanding
      ? `/${nextSlug}${guestLanding}`
      : pathname
        ? (resolveNextPathname?.({ currentPathname: pathname, nextSlug }) ??
          pathname.replace(/^\/[^/]+/, `/${nextSlug}`))
        : getWorkspaceLandingPath(nextSlug);
    if (!guestLanding)
      nextPath = normalizeWorkspaceSwitchPath(nextPath, nextSlug);
    router.push(nextPath);
  };
  const workspace =
    wsId === PERSONAL_WORKSPACE_SLUG
      ? personalWorkspace
      : workspaces.find((ws) => ws.id === resolvedWorkspaceId);
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

      void queryClient.invalidateQueries({
        queryKey: ['workspace-ui-list', actorId],
      });
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
        <Picker open={open} onOpenChange={setOpen}>
          <PickerTrigger asChild disabled={!hasSelectableWorkspaces}>
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
          </PickerTrigger>
          <WorkspacePickerContent
            presentation={presentation}
            onClose={() => setOpen(false)}
            workspaces={workspaces ?? []}
            currentId={workspace?.id}
            defaultId={defaultWorkspaceId}
            visibility={visibility}
            onSelect={(selected) => {
              onValueChange(selected);
              setOpen(false);
            }}
            onDefault={(id) => updateDefaultWorkspaceMutation.mutate(id)}
            onCreate={
              disableCreateNewWorkspace
                ? undefined
                : () => {
                    setOpen(false);
                    setShowNewWorkspaceDialog(true);
                  }
            }
            onJoin={() => {
              setOpen(false);
              setShowJoinWorkspaceDialog(true);
            }}
            invitations={
              <Command>
                <WorkspaceInvitationItems
                  controller={invitationController}
                  fallbackLogoUrl={fallbackLogoUrl}
                />
              </Command>
            }
          />
        </Picker>
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

export { HiddenWorkspacesSettings } from './hidden-workspaces-settings';

export { VisibleWorkspaceFilter } from './visible-workspace-filter';
