'use client';

import { AudioLines, FileText, ShieldCheck, Undo2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import type { TranscriptionConsent } from './use-transcription-consent';

const FACTS = [
  { icon: FileText, key: 'fact_text' },
  { icon: ShieldCheck, key: 'fact_storage' },
  { icon: Undo2, key: 'fact_withdraw' },
] as const;

/**
 * Per-participant opt-in. Nobody is transcribed until they choose Allow.
 * Clicking outside does nothing; Escape means "decide later" and keeps the
 * participant excluded.
 */
export function TranscriptionConsentDialog({
  consent,
  open,
  onOpenChange,
  hostName,
}: {
  consent: TranscriptionConsent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostName?: string;
}) {
  const t = useTranslations('meet.consent');
  const busy = consent.decide.isPending;
  const choose = (allowed: boolean) =>
    consent.decide.mutate(allowed, {
      onSuccess: () => onOpenChange(false),
      onError: () => toast.error(t('save_failed')),
    });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        className="gap-5 sm:max-w-md"
      >
        <DialogHeader className="gap-3 text-left">
          <span className="grid size-11 place-items-center rounded-xl bg-dynamic-blue/10 text-dynamic-blue">
            <AudioLines aria-hidden="true" className="size-5" />
          </span>
          <DialogTitle>
            {hostName ? t('title', { name: hostName }) : t('title_host')}
          </DialogTitle>
          <DialogDescription>
            {t.rich('description', {
              // Today any workspace member who can open the meeting can read it.
              audience: t('audience_participants_admins'),
              strong: (chunks) => (
                <strong className="font-semibold text-foreground">
                  {chunks}
                </strong>
              ),
            })}
          </DialogDescription>
        </DialogHeader>
        <ul className="space-y-2.5 rounded-xl bg-muted/50 p-4 text-sm">
          {FACTS.map(({ icon: Icon, key }) => (
            <li key={key} className="flex items-start gap-2.5">
              <Icon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
        <DialogFooter className="grid grid-cols-2 gap-2 sm:space-x-0">
          {consent.selfDecision === true ? (
            <Button
              variant="outline"
              className="col-span-2"
              disabled={busy}
              onClick={() => choose(false)}
            >
              {t('withdraw')}
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => choose(false)}
              >
                {t('decline')}
              </Button>
              <Button disabled={busy} onClick={() => choose(true)}>
                {t('allow')}
              </Button>
            </>
          )}
        </DialogFooter>
        <a
          href="https://tuturuuu.com/privacy"
          target="_blank"
          rel="noreferrer"
          className="justify-self-center text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground"
        >
          {t('details')}
        </a>
      </DialogContent>
    </Dialog>
  );
}
