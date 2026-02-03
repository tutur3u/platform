'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Link2, Plus, Trash2, Users2 } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { zodResolver } from '@tuturuuu/ui/resolvers';
import { ScrollArea } from '@tuturuuu/ui/scroll-area';
import { toast } from '@tuturuuu/ui/sonner';
import moment from 'moment';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import * as z from 'zod';

interface User {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  handle: string | null;
}

interface InviteLinkUse {
  id: string;
  user_id: string;
  joined_at: string;
  users: User;
}

interface InviteLink {
  id: string;
  ws_id: string;
  code: string;
  creator_id: string;
  max_uses: number | null;
  expires_at: string | null;
  created_at: string;
  current_uses: number;
  is_expired: boolean;
  is_full: boolean;
}

interface InviteLinkDetails extends InviteLink {
  uses?: InviteLinkUse[];
}

interface Props {
  wsId: string;
  canManageMembers: boolean;
}

const CreateLinkSchema = z.object({
  maxUses: z.coerce.number().int().positive().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
});

export default function InviteLinksSection({ wsId, canManageMembers }: Props) {
  const router = useRouter();
  const t = useTranslations();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewingLinkId, setViewingLinkId] = useState<string | null>(null);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(CreateLinkSchema),
    defaultValues: {
      maxUses: null,
      expiresAt: null,
    },
  });

  // Fetch links with useQuery
  const { data: links = [], isLoading: loading } = useQuery<InviteLink[]>({
    queryKey: ['workspace', wsId, 'invite-links'],
    queryFn: async () => {
      const res = await fetch(`/api/workspaces/${wsId}/invite-links`);
      if (!res.ok) throw new Error('Failed to fetch invite links');
      return res.json();
    },
  });

  // Fetch link details with useQuery
  const { data: viewingLink, isLoading: loadingDetails } =
    useQuery<InviteLinkDetails>({
      queryKey: ['workspace', wsId, 'invite-links', viewingLinkId],
      queryFn: async () => {
        const res = await fetch(
          `/api/workspaces/${wsId}/invite-links/${viewingLinkId}`
        );
        if (!res.ok) throw new Error('Failed to fetch invite link details');
        return res.json();
      },
      enabled: !!viewingLinkId && viewDialogOpen,
    });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (values: z.infer<typeof CreateLinkSchema>) => {
      const res = await fetch(`/api/workspaces/${wsId}/invite-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxUses: values.maxUses,
          expiresAt: values.expiresAt
            ? new Date(values.expiresAt).toISOString()
            : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        // Throw error with errorCode for special handling
        const error = new Error(
          data.error || t('ws-invite-links.create-error')
        );
        (error as any).errorCode = data.errorCode;
        throw error;
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success(t('ws-invite-links.create-success'));
      form.reset();
      setOpen(false);
      queryClient.invalidateQueries({
        queryKey: ['workspace', wsId, 'invite-links'],
      });
      router.refresh();
    },
    onError: (error: Error & { errorCode?: string }) => {
      // Handle seat limit reached error with actionable toast
      if (error.errorCode === 'SEAT_LIMIT_REACHED') {
        toast.error(t('ws-invite-links.seat-limit-reached'), {
          description: t('ws-invite-links.seat-limit-reached-description'),
          action: {
            label: t('ws-invite-links.manage-billing'),
            onClick: () => router.push(`/${wsId}/billing`),
          },
          duration: 10000,
        });
      } else {
        toast.error(error.message);
      }
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (linkId: string) => {
      const res = await fetch(
        `/api/workspaces/${wsId}/invite-links/${linkId}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || t('ws-invite-links.delete-error'));
      }
    },
    onSuccess: () => {
      toast.success(t('ws-invite-links.delete-success'));
      setConfirmDeleteId(null);
      queryClient.invalidateQueries({
        queryKey: ['workspace', wsId, 'invite-links'],
      });
      router.refresh();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleCreateLink = (values: z.infer<typeof CreateLinkSchema>) => {
    createMutation.mutate(values);
  };

  const handleDeleteLink = () => {
    if (confirmDeleteId) {
      deleteMutation.mutate(confirmDeleteId);
    }
  };

  const copyInviteLink = async (code: string, linkId: string) => {
    const url = `${window.location.origin}/invite/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(linkId);
      toast.success(t('ws-invite-links.copy-success'));
      setTimeout(() => setCopiedId(null), 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      toast.error(t('ws-invite-links.copy-error'));
    }
  };

  const openLinkDetails = (linkId: string) => {
    setViewingLinkId(linkId);
    setViewDialogOpen(true);
  };

  const getStatusBadge = (link: InviteLink) => {
    if (link.is_expired) {
      return (
        <span className="rounded-full bg-dynamic-red/10 px-2 py-1 font-medium text-dynamic-red text-xs">
          {t('ws-invite-links.expired')}
        </span>
      );
    }
    if (link.is_full) {
      return (
        <span className="rounded-full bg-dynamic-orange/10 px-2 py-1 font-medium text-dynamic-orange text-xs">
          {t('ws-invite-links.full')}
        </span>
      );
    }
    return (
      <span className="rounded-full bg-dynamic-green/10 px-2 py-1 font-medium text-dynamic-green text-xs">
        {t('ws-invite-links.active')}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Modern Header Section */}
      <div className="relative overflow-hidden rounded-xl border border-border bg-linear-to-br from-background via-background to-foreground/[0.02] p-6 shadow-sm">
        {/* Decorative elements */}
        <div className="pointer-events-none absolute -top-4 -right-4 h-24 w-24 rounded-full bg-dynamic-purple/5 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-4 -left-4 h-24 w-24 rounded-full bg-dynamic-blue/5 blur-2xl" />

        <div className="relative flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-linear-to-br from-dynamic-purple to-dynamic-blue shadow-md">
                <Link2 className="h-5 w-5 text-background" />
              </div>
              <h3 className="bg-linear-to-br from-foreground to-foreground/70 bg-clip-text font-semibold text-2xl text-transparent">
                {t('ws-invite-links.title')}
              </h3>
            </div>
            <p className="ml-13 max-w-2xl text-foreground/70 leading-relaxed">
              {t('ws-invite-links.description')}
            </p>
          </div>
          {canManageMembers && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="shrink-0 bg-linear-to-r from-dynamic-blue to-dynamic-purple shadow-lg transition-all hover:shadow-xl">
                  <Plus className="mr-2 h-4 w-4" />
                  {t('ws-invite-links.create-link')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('ws-invite-links.create-link')}</DialogTitle>
                  <DialogDescription>
                    {t('ws-invite-links.create-description')}
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(handleCreateLink)}
                    className="space-y-4"
                  >
                    <FormField
                      control={form.control}
                      name="maxUses"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('ws-invite-links.max-uses')}</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              placeholder={t(
                                'ws-invite-links.max-uses-placeholder'
                              )}
                              {...field}
                              value={field.value?.toString() ?? ''}
                            />
                          </FormControl>
                          <FormDescription>
                            {t('ws-invite-links.max-uses-description')}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="expiresAt"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            {t('ws-invite-links.expires-at')}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="datetime-local"
                              {...field}
                              value={field.value ?? ''}
                            />
                          </FormControl>
                          <FormDescription>
                            {t('ws-invite-links.expires-at-description')}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <Button
                      type="submit"
                      className="w-full"
                      disabled={createMutation.isPending}
                    >
                      {createMutation.isPending
                        ? t('common.loading')
                        : t('ws-invite-links.create-link')}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Links List Section */}
      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-border bg-background p-12">
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-foreground/20 border-t-foreground" />
            <p className="text-foreground/60 text-sm">{t('common.loading')}</p>
          </div>
        </div>
      ) : links.length === 0 ? (
        <div className="rounded-xl border border-foreground/20 border-dashed bg-foreground/[0.02] p-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-linear-to-br from-dynamic-purple/10 to-dynamic-blue/10">
            <Link2 className="h-8 w-8 text-foreground/40" />
          </div>
          <h4 className="mb-2 font-semibold text-foreground text-lg">
            {t('ws-invite-links.no-links')}
          </h4>
          <p className="text-foreground/60 text-sm">
            {t('ws-invite-links.no-links-description')}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
          {links.map((link) => (
            <div
              key={link.id}
              className="group relative overflow-hidden rounded-xl border border-border bg-background p-5 shadow-sm transition-all hover:border-foreground/20 hover:shadow-md"
            >
              {/* Subtle gradient background on hover */}
              <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-dynamic-blue/0 via-dynamic-purple/0 to-dynamic-pink/0 opacity-0 transition-opacity group-hover:opacity-[0.03]" />

              <div className="relative space-y-4">
                {/* Header with status */}
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(link)}
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1">
                    {link.current_uses > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openLinkDetails(link.id)}
                        title={t('ws-invite-links.view-users')}
                        className="h-8 w-8 p-0 hover:bg-dynamic-blue/10"
                      >
                        <Users2 className="h-4 w-4 text-dynamic-blue" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyInviteLink(link.code, link.id)}
                      className="h-8 w-8 p-0 hover:bg-dynamic-green/10"
                      title={t('ws-invite-links.copy-link')}
                    >
                      {copiedId === link.id ? (
                        <Check className="h-4 w-4 text-dynamic-green" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    {canManageMembers && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeleteId(link.id)}
                        className="h-8 w-8 p-0 hover:bg-dynamic-red/10"
                        title={t('ws-invite-links.delete-link')}
                      >
                        <Trash2 className="h-4 w-4 text-dynamic-red" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Link URL */}
                <div className="overflow-hidden rounded-lg border border-border bg-foreground/5 p-3">
                  <code className="block truncate font-mono text-foreground/80 text-xs">
                    {window.location.origin}/invite/{link.code}
                  </code>
                </div>

                {/* Stats */}
                <div className="flex flex-wrap items-center gap-4 border-border border-t pt-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md bg-dynamic-blue/10">
                      <Users2 className="h-3.5 w-3.5 text-dynamic-blue" />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground text-xs">
                        {link.current_uses}
                        {link.max_uses ? `/${link.max_uses}` : ''}
                      </span>
                      <span className="text-[10px] text-foreground/50">
                        {t('ws-invite-links.uses')}
                      </span>
                    </div>
                  </div>

                  {link.expires_at && (
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-dynamic-orange/10">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-3.5 w-3.5 text-dynamic-orange"
                        >
                          <title>Expires at</title>
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium text-foreground text-xs">
                          {moment(link.expires_at).format('MMM D')}
                        </span>
                        <span className="text-[10px] text-foreground/50">
                          Expires
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="ml-auto text-right">
                    <span className="text-[10px] text-foreground/50">
                      {moment(link.created_at).fromNow()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View Users Dialog - Enhanced */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-dynamic-blue to-dynamic-purple">
                <Users2 className="h-4 w-4 text-background" />
              </div>
              {t('ws-invite-links.users-joined-title')}
            </DialogTitle>
            <DialogDescription>
              {t('ws-invite-links.users-joined-description')}
            </DialogDescription>
          </DialogHeader>

          {loadingDetails ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-3">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-foreground/20 border-t-foreground" />
                <p className="text-foreground/60 text-sm">
                  {t('common.loading')}
                </p>
              </div>
            </div>
          ) : viewingLink ? (
            <div className="space-y-6">
              {/* Link Info Card */}
              <div className="rounded-xl border border-border bg-linear-to-br from-foreground/[0.02] to-foreground/[0.05] p-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-foreground/60 text-xs uppercase tracking-wide">
                      {t('ws-invite-links.link-code')}
                    </p>
                    <code className="block rounded-md bg-background px-3 py-2 font-mono text-sm shadow-sm">
                      {viewingLink.code}
                    </code>
                  </div>
                  <div className="space-y-1">
                    <p className="text-foreground/60 text-xs uppercase tracking-wide">
                      {t('ws-invite-links.total-uses')}
                    </p>
                    <p className="rounded-md bg-background px-3 py-2 font-medium text-sm shadow-sm">
                      {viewingLink.current_uses}
                      {viewingLink.max_uses
                        ? `/${viewingLink.max_uses}`
                        : ' / ∞'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Users List */}
              {viewingLink.uses && viewingLink.uses.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-foreground text-sm">
                      {t('ws-invite-links.members-joined')}
                    </h4>
                    <span className="rounded-full bg-dynamic-blue/10 px-3 py-1 font-medium text-dynamic-blue text-xs">
                      {viewingLink.uses.length}{' '}
                      {viewingLink.uses.length === 1 ? 'member' : 'members'}
                    </span>
                  </div>
                  <ScrollArea className="h-[350px] rounded-xl border border-border">
                    <div className="divide-y divide-border">
                      {viewingLink.uses.map((use) => (
                        <div
                          key={use.id}
                          className="group flex items-center justify-between p-4 transition-colors hover:bg-foreground/5"
                        >
                          <div className="flex items-center gap-4">
                            <Avatar className="h-11 w-11 ring-2 ring-border ring-offset-2 ring-offset-background transition-all group-hover:ring-dynamic-blue/30">
                              <AvatarImage
                                src={use.users.avatar_url || undefined}
                                alt={
                                  use.users.display_name ||
                                  use.users.handle ||
                                  'User'
                                }
                              />
                              <AvatarFallback className="bg-linear-to-br from-dynamic-blue to-dynamic-purple font-semibold text-background">
                                {(
                                  use.users.display_name ||
                                  use.users.handle ||
                                  'U'
                                )
                                  .charAt(0)
                                  .toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="space-y-0.5">
                              <p className="font-medium text-foreground text-sm">
                                {use.users.display_name ||
                                  use.users.handle ||
                                  'Unknown User'}
                              </p>
                              {use.users.handle && use.users.display_name && (
                                <p className="text-foreground/60 text-xs">
                                  @{use.users.handle}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-foreground text-sm">
                              {moment(use.joined_at).fromNow()}
                            </p>
                            <p className="text-foreground/50 text-xs">
                              {moment(use.joined_at).format(
                                'MMM D, YYYY • h:mm A'
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              ) : (
                <div className="rounded-xl border border-foreground/20 border-dashed bg-foreground/[0.02] p-12 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-linear-to-br from-dynamic-purple/10 to-dynamic-blue/10">
                    <Users2 className="h-8 w-8 text-foreground/40" />
                  </div>
                  <h4 className="mb-2 font-semibold text-base text-foreground">
                    No members yet
                  </h4>
                  <p className="text-foreground/60 text-sm">
                    {t('ws-invite-links.no-users-joined')}
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!confirmDeleteId}
        onOpenChange={(open) => !open && setConfirmDeleteId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('ws-invite-links.delete-confirm-title')}
            </DialogTitle>
            <DialogDescription>
              {t('ws-invite-links.delete-confirm')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteId(null)}
              disabled={deleteMutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteLink}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending
                ? t('common.deleting')
                : t('common.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
