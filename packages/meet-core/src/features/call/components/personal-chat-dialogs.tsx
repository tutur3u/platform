'use client';
import { Share2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { MiraAdultNotice } from '../../live-assistant/mira-adult-notice';

/** Continue with Mira, from the composer, with the 18+ condition beside it. */
export function EnableMiraDialog({
  open,
  onOpenChange,
  pending,
  failed,
  onContinue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  failed: boolean;
  onContinue: () => void;
}) {
  const t = useTranslations('meet.call');
  const liveT = useTranslations('meet.live');
  const adultNoticeId = useId();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('personal_enable')}</DialogTitle>
          <DialogDescription>{liveT('phase_notice')}</DialogDescription>
        </DialogHeader>
        {failed && (
          <p className="text-destructive text-sm" role="alert">
            {liveT('choice_failed')}
          </p>
        )}
        <MiraAdultNotice consent id={adultNoticeId} />
        <Button
          type="button"
          disabled={pending}
          aria-describedby={adultNoticeId}
          onClick={onContinue}
        >
          {liveT('phase_continue')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** Reviews one private answer before it is posted to the room as the person's own message. */
export function ShareSnippetDialog({
  text,
  onText,
  onClose,
  pending,
  failed,
  onConfirm,
}: {
  /** The excerpt under review; null keeps the dialog closed. */
  text: string | null;
  onText: (value: string) => void;
  onClose: () => void;
  pending: boolean;
  failed: boolean;
  onConfirm: (text: string) => void;
}) {
  const t = useTranslations('meet.call');
  return (
    <Dialog
      open={text !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('personal_share')}</DialogTitle>
          <DialogDescription>{t('personal_share_hint')}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={text ?? ''}
          onChange={(event) => onText(event.target.value)}
          maxLength={2000}
          disabled={pending}
          className="min-h-48"
          aria-label={t('personal_share')}
        />
        {failed && (
          <p role="alert" className="text-destructive text-sm">
            {t('chat_send_failed')}
          </p>
        )}
        <Button
          disabled={!text?.trim() || pending}
          onClick={() => text && onConfirm(text)}
        >
          <Share2 className="size-4" />
          {t('personal_share_confirm')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
