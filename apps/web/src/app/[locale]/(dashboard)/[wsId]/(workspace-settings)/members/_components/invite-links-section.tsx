'use client';

import { Check, Copy, Link2, Plus, Trash2 } from '@tuturuuu/icons';
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
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import moment from 'moment';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import * as z from 'zod';

interface InviteLink {
  id: string;
  ws_id: string;
  code: string;
  creator_id: string;
  role: string;
  role_title: string;
  max_uses: number | null;
  expires_at: string | null;
  created_at: string;
  current_uses: number;
  is_expired: boolean;
  is_full: boolean;
}

interface Props {
  wsId: string;
  canManageMembers: boolean;
}

const CreateLinkSchema = z.object({
  roleTitle: z.string().optional(),
  maxUses: z.coerce.number().int().positive().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
});

export default function InviteLinksSection({
  wsId,
  canManageMembers,
}: Props) {
  const router = useRouter();
  const t = useTranslations();
  const [links, setLinks] = useState<InviteLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(CreateLinkSchema),
    defaultValues: {
      roleTitle: '',
      maxUses: null,
      expiresAt: null,
    },
  });

  const fetchLinks = async () => {
    try {
      const res = await fetch(`/api/workspaces/${wsId}/invite-links`);
      if (res.ok) {
        const data = await res.json();
        setLinks(data);
      }
    } catch (error) {
      console.error('Failed to fetch invite links:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinks();
  }, [wsId]);

  const createInviteLink = async (values: z.infer<typeof CreateLinkSchema>) => {
    try {
      const res = await fetch(`/api/workspaces/${wsId}/invite-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roleTitle: values.roleTitle,
          maxUses: values.maxUses,
          expiresAt: values.expiresAt
            ? new Date(values.expiresAt).toISOString()
            : null,
        }),
      });

      if (res.ok) {
        toast.success(t('ws-invite-links.create-success'));
        form.reset();
        setOpen(false);
        fetchLinks();
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || t('ws-invite-links.create-error'));
      }
    } catch (error) {
      console.error('Failed to create invite link:', error);
      toast.error(t('ws-invite-links.create-error'));
    }
  };

  const deleteInviteLink = async (linkId: string) => {
    if (!confirm(t('ws-invite-links.delete-confirm'))) return;

    try {
      const res = await fetch(
        `/api/workspaces/${wsId}/invite-links/${linkId}`,
        {
          method: 'DELETE',
        }
      );

      if (res.ok) {
        toast.success(t('ws-invite-links.delete-success'));
        fetchLinks();
        router.refresh();
      } else {
        const data = await res.json();
        toast.error(data.error || t('ws-invite-links.delete-error'));
      }
    } catch (error) {
      console.error('Failed to delete invite link:', error);
      toast.error(t('ws-invite-links.delete-error'));
    }
  };

  const copyInviteLink = (code: string, linkId: string) => {
    const url = `${window.location.origin}/invite/${code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(linkId);
    toast.success(t('ws-invite-links.copy-success'));
    setTimeout(() => setCopiedId(null), 2000);
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">{t('ws-invite-links.title')}</h3>
          <p className="text-foreground/60 text-sm">
            {t('ws-invite-links.description')}
          </p>
        </div>
        {canManageMembers && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
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
                  onSubmit={form.handleSubmit(createInviteLink)}
                  className="space-y-4"
                >
                  <FormField
                    control={form.control}
                    name="roleTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('ws-invite-links.role-title')}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t(
                              'ws-invite-links.role-title-placeholder'
                            )}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          {t('ws-invite-links.role-title-description')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

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
                            placeholder={t('ws-invite-links.max-uses-placeholder')}
                            {...field}
                            value={field.value ?? ''}
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
                        <FormLabel>{t('ws-invite-links.expires-at')}</FormLabel>
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

                  <Button type="submit" className="w-full">
                    {t('ws-invite-links.create-link')}
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Separator />

      {loading ? (
        <div className="text-center text-foreground/60">
          {t('common.loading')}
        </div>
      ) : links.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Link2 className="mx-auto mb-2 h-8 w-8 text-foreground/40" />
          <p className="text-foreground/60">{t('ws-invite-links.no-links')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {links.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  {getStatusBadge(link)}
                  {link.role_title && (
                    <span className="text-foreground/60 text-sm">
                      {link.role_title}
                    </span>
                  )}
                </div>
                <div className="font-mono text-foreground/80 text-sm">
                  {window.location.origin}/invite/{link.code}
                </div>
                <div className="flex items-center gap-4 text-foreground/60 text-xs">
                  <span>
                    {t('ws-invite-links.uses')}: {link.current_uses}
                    {link.max_uses ? `/${link.max_uses}` : ''}
                  </span>
                  {link.expires_at && (
                    <span>
                      {t('ws-invite-links.expires')}:{' '}
                      {moment(link.expires_at).format('MMM D, YYYY')}
                    </span>
                  )}
                  <span>
                    {t('ws-invite-links.created')}:{' '}
                    {moment(link.created_at).fromNow()}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyInviteLink(link.code, link.id)}
                >
                  {copiedId === link.id ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                {canManageMembers && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteInviteLink(link.id)}
                  >
                    <Trash2 className="h-4 w-4 text-dynamic-red" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
