'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Loader2 } from '@tuturuuu/icons';
import {
  createWorkspaceUserProfileLink,
  type WorkspaceUserProfileLinkField,
} from '@tuturuuu/internal-api/users';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const FIELD_OPTIONS: WorkspaceUserProfileLinkField[] = [
  'display_name',
  'full_name',
  'birthday',
  'gender',
  'avatar_url',
  'email',
];

interface Props {
  wsId: string;
  mode: 'per_user' | 'generic';
  targetUserId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RequestProfileDetailsDialog({
  wsId,
  mode,
  targetUserId,
  open,
  onOpenChange,
}: Props) {
  const t = useTranslations('ws-user-profile-links');
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<WorkspaceUserProfileLinkField[]>([
    'display_name',
    'full_name',
  ]);
  const [expiresAt, setExpiresAt] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const toggleField = (
    field: WorkspaceUserProfileLinkField,
    checked: boolean
  ) =>
    setSelected((prev) =>
      checked ? [...prev, field] : prev.filter((f) => f !== field)
    );

  const reset = () => {
    setSelected(['display_name', 'full_name']);
    setExpiresAt('');
    setMaxUses('');
    setShareUrl(null);
    setCopied(false);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createWorkspaceUserProfileLink(wsId, {
        mode,
        target_user_id: mode === 'per_user' ? targetUserId : null,
        allowed_fields: selected,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        max_uses: maxUses ? Number.parseInt(maxUses, 10) : null,
      }),
    onSuccess: ({ code }) => {
      setShareUrl(`${window.location.origin}/shared/user-profile/${code}`);
      queryClient.invalidateQueries({
        queryKey: ['workspace-user-profile-links', wsId],
      });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('create_error')),
  });

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    toast.success(t('link_copied'));
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'generic' ? t('create_generic_title') : t('create_title')}
          </DialogTitle>
          <DialogDescription>{t('create_description')}</DialogDescription>
        </DialogHeader>

        {shareUrl ? (
          <div className="space-y-3">
            <p className="text-muted-foreground text-sm">
              {t('create_success_hint')}
            </p>
            <div className="flex items-center gap-2">
              <Input readOnly value={shareUrl} />
              <Button type="button" size="icon" onClick={copyLink}>
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('create_fields_label')}</Label>
              <div className="grid grid-cols-2 gap-2">
                {FIELD_OPTIONS.map((field) => (
                  <label
                    key={field}
                    className="flex items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={selected.includes(field)}
                      onCheckedChange={(checked) =>
                        toggleField(field, checked === true)
                      }
                    />
                    {t(`field_${field}` as never)}
                  </label>
                ))}
              </div>
              {selected.includes('email') ? (
                <p className="text-muted-foreground text-xs">
                  {t('create_email_hint')}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="expires_at">{t('create_expires_at')}</Label>
                <Input
                  id="expires_at"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_uses">{t('create_max_uses')}</Label>
                <Input
                  id="max_uses"
                  type="number"
                  min={1}
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                />
              </div>
            </div>

            <Button
              className="w-full"
              disabled={selected.length === 0 || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t('create_submit')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
