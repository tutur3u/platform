'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Copy,
  Link2,
  Loader2,
  Plus,
  Trash2,
  Users,
} from '@tuturuuu/icons';
import {
  createWorkspaceInviteLink,
  deleteWorkspaceInviteLink,
  listWorkspaceInviteLinks,
} from '@tuturuuu/internal-api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type InviteLink = {
  code: string;
  currentUses: number;
  id: string;
  memberType: 'GUEST' | 'MEMBER';
};

function normalizeInviteLink(row: Record<string, unknown>): InviteLink {
  return {
    code: String(row.code ?? ''),
    currentUses: Number(row.current_uses ?? 0),
    id: String(row.id ?? ''),
    memberType:
      String(row.member_type ?? row.type ?? row.memberType).toUpperCase() ===
      'GUEST'
        ? 'GUEST'
        : 'MEMBER',
  };
}

export function InviteLinksSection({
  disabled,
  wsId,
}: {
  disabled: boolean;
  wsId: string;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [memberType, setMemberType] = useState<'GUEST' | 'MEMBER'>('MEMBER');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const queryKey = ['workspace', wsId, 'invite-links'] as const;
  const linksQuery = useQuery({
    queryFn: async () =>
      (await listWorkspaceInviteLinks(wsId)).map(normalizeInviteLink),
    queryKey,
    staleTime: 30_000,
  });
  const createMutation = useMutation({
    mutationFn: () =>
      createWorkspaceInviteLink(wsId, {
        expiresAt: null,
        maxUses: null,
        memberType,
      }),
    onError: (error) =>
      toast.error(
        error instanceof Error
          ? error.message
          : t('ws-invite-links.create-error')
      ),
    onSuccess: async () => {
      setDeleteId(null);
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey });
      toast.success(t('ws-invite-links.create-success'));
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (linkId: string) => deleteWorkspaceInviteLink(wsId, linkId),
    onError: () => toast.error(t('ws-invite-links.delete-error')),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      toast.success(t('ws-invite-links.delete-success'));
    },
  });

  const copyLink = async (link: InviteLink) => {
    await navigator.clipboard.writeText(
      `${window.location.origin}/invite/${link.code}`
    );
    setCopiedId(link.id);
    window.setTimeout(() => setCopiedId(null), 1600);
    toast.success(t('ws-invite-links.copy-success'));
  };

  return (
    <section className="space-y-3 rounded-2xl border bg-card/40 p-4 sm:p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl border border-dynamic-blue/20 bg-dynamic-blue/10 p-2 text-dynamic-blue">
            <Link2 />
          </div>
          <div>
            <h3 className="font-semibold">{t('ws-invite-links.title')}</h3>
            <p className="text-muted-foreground text-sm">
              {t('ws-invite-links.description')}
            </p>
          </div>
        </div>
        <Button
          disabled={disabled}
          onClick={() => setCreateOpen(true)}
          size="sm"
        >
          <Plus />
          {t('ws-invite-links.create-link')}
        </Button>
      </div>

      {linksQuery.isPending ? (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      ) : linksQuery.data?.length ? (
        <div className="grid gap-2">
          {linksQuery.data.map((link) => (
            <div
              className="flex items-center gap-2 rounded-xl border bg-background/70 p-3"
              key={link.id}
            >
              <Users className="shrink-0 text-muted-foreground" />
              <code className="min-w-0 flex-1 truncate text-xs">
                /invite/{link.code}
              </code>
              <Badge variant="secondary">
                {link.memberType === 'GUEST'
                  ? t('ws-invite-links.membership-short-guest')
                  : t('ws-invite-links.membership-short-member')}
              </Badge>
              <Badge variant="outline">{link.currentUses}</Badge>
              <Button
                aria-label={t('ws-invite-links.copy-link')}
                onClick={() => void copyLink(link)}
                size="icon"
                variant="ghost"
              >
                {copiedId === link.id ? <Check /> : <Copy />}
              </Button>
              <Button
                aria-label={t('ws-invite-links.delete-link')}
                disabled={disabled || deleteMutation.isPending}
                onClick={() => setDeleteId(link.id)}
                size="icon"
                variant="ghost"
              >
                <Trash2 className="text-dynamic-red" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-5 text-center text-muted-foreground text-sm">
          {t('ws-invite-links.no-links')}
        </p>
      )}

      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('ws-invite-links.create-link')}</DialogTitle>
            <DialogDescription>
              {t('ws-invite-links.create-description')}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label>{t('ws-members.invite_membership_label')}</Label>
            <Select
              onValueChange={(value) =>
                setMemberType(value as 'GUEST' | 'MEMBER')
              }
              value={memberType}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">
                  {t('ws-members.invite_membership_member')}
                </SelectItem>
                <SelectItem value="GUEST">
                  {t('ws-members.invite_membership_guest')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button onClick={() => setCreateOpen(false)} variant="outline">
              {t('common.cancel')}
            </Button>
            <Button
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending && <Loader2 className="animate-spin" />}
              {t('ws-invite-links.create-link')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => !open && setDeleteId(null)}
        open={Boolean(deleteId)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('ws-invite-links.delete-confirm-title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('ws-invite-links.delete-confirmation-description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
