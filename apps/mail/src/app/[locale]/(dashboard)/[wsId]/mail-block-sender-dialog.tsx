'use client';

import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import type { SenderBlockRule } from '@/lib/mail/sender-blocks/match';
import { senderBlockTarget } from './mail-sender-block-model';
import { useProfileBlockAction } from './use-profile-block-action';

/** Confirms one sender or domain block chosen on the profile card. */
export function MailBlockSenderDialog({
  workspaceId,
  mailboxId,
  address,
  rule,
  onOpenChange,
}: {
  workspaceId: string;
  mailboxId: string;
  address: string;
  rule: SenderBlockRule | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('mail.profile_actions');
  const moveId = useId();
  const [moveExisting, setMoveExisting] = useState(true);
  const block = useProfileBlockAction(workspaceId, mailboxId, address);
  const target = rule ? senderBlockTarget(rule) : '';

  return (
    <Dialog
      open={Boolean(rule)}
      onOpenChange={(open) => {
        if (!block.isPending) onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('block_title', { target })}</DialogTitle>
          <DialogDescription>{t('block_consequence')}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Checkbox
            id={moveId}
            checked={moveExisting}
            disabled={block.isPending}
            onCheckedChange={(checked) => setMoveExisting(checked === true)}
          />
          <Label htmlFor={moveId} className="font-normal">
            {t('move_existing')}
          </Label>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={block.isPending}
            onClick={() => onOpenChange(false)}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!rule || block.isPending}
            onClick={() => {
              if (!rule) return;
              block.mutate(
                { ...rule, moveExisting },
                { onSuccess: () => onOpenChange(false) }
              );
            }}
          >
            {block.isPending ? t('blocking') : t('block_confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
