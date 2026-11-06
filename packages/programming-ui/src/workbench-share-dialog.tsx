'use client';
import { useMutation } from '@tanstack/react-query';
import { shareHostedPlayground } from '@tuturuuu/internal-api/playgrounds';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/** Hosted playground owners invite or revoke an editor by account id. */
export function WorkbenchShareDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('programmingPlayground');
  const [invite, setInvite] = useState('');
  const share = useMutation({
    mutationFn: (role: 'editor' | null) =>
      shareHostedPlayground(projectId, { userId: invite.trim(), role }),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('share')}</DialogTitle>
        </DialogHeader>
        <Label htmlFor="programming-invite">{t('accountId')}</Label>
        <Input
          id="programming-invite"
          value={invite}
          onChange={(event) => setInvite(event.target.value)}
        />
        <div className="flex gap-2">
          <Button
            disabled={share.isPending || !invite.trim()}
            onClick={() => share.mutate('editor')}
          >
            {t('invite')}
          </Button>
          <Button
            variant="outline"
            disabled={share.isPending || !invite.trim()}
            onClick={() => share.mutate(null)}
          >
            {t('revoke')}
          </Button>
        </div>
        {share.isError && (
          <p role="alert" className="text-destructive text-sm">
            {t('failed')}
          </p>
        )}
        {share.isSuccess && (
          <output className="block text-muted-foreground text-sm">
            {t('shared')}
          </output>
        )}
      </DialogContent>
    </Dialog>
  );
}
