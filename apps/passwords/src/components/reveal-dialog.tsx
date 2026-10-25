import { Check, Copy, Download, Eye, EyeOff } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/provider';
import { decodeUtf8 } from '../lib/bytes';
import { CLIPBOARD_CLEAR_MS, copyWithAutoClear } from '../lib/clipboard';
import { saveBytes } from '../lib/save-file';
import type { SecretLease } from '../lib/secret-lease';

interface Props {
  lease: SecretLease | null;
  onClose(): void;
}

function useRemainingSeconds(expiresAt: number | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const ticker = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(ticker);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : 0;
}

function LeaseCountdown({ expiresAt }: { expiresAt: number | undefined }) {
  const { t } = useI18n();
  const remaining = useRemainingSeconds(expiresAt);
  return (
    <DialogDescription role="timer" aria-live="off">
      {t('reveal.hidesIn', { seconds: remaining })}
    </DialogDescription>
  );
}

export function RevealDialog({ lease, onClose }: Props) {
  const { t } = useI18n();
  const [shown, setShown] = useState<SecretLease | null>(null);
  // Tied to the lease so a new reveal always starts masked.
  const visible = lease !== null && shown === lease;
  // Decoded only while the lease lives; the bytes are zeroed when it ends.
  const text = useMemo(() => (lease ? decodeUtf8(lease.bytes) : null), [lease]);

  const close = () => {
    setShown(null);
    onClose();
  };

  const copy = async () => {
    if (text === null) return;
    await copyWithAutoClear(text, {
      onSettled: (outcome) => {
        if (outcome === 'unverifiable')
          toast.warning(t('reveal.clipboardUnverified'));
      },
    });
    toast.success(t('reveal.copied', { seconds: CLIPBOARD_CLEAR_MS / 1000 }));
  };

  return (
    <Dialog open={lease !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('reveal.title', { name: lease?.name ?? '' })}
          </DialogTitle>
          <LeaseCountdown key={lease?.expiresAt} expiresAt={lease?.expiresAt} />
        </DialogHeader>
        {text === null ? (
          <p className="text-muted-foreground text-sm">{t('reveal.binary')}</p>
        ) : (
          <Textarea
            readOnly
            rows={6}
            aria-label={t('reveal.value')}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            // A fixed-length mask never reveals the secret's length.
            value={visible ? text : '•'.repeat(24)}
          />
        )}
        <div className="flex flex-wrap justify-end gap-2">
          {text !== null && (
            <>
              <Button
                variant="outline"
                size="sm"
                aria-pressed={visible}
                onClick={() => setShown(visible ? null : lease)}
              >
                {visible ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                {visible ? t('reveal.hide') : t('reveal.show')}
              </Button>
              <Button variant="outline" size="sm" onClick={copy}>
                <Copy className="h-4 w-4" />
                {t('reveal.copy')}
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => lease && saveBytes(lease.bytes, lease.name)}
          >
            <Download className="h-4 w-4" />
            {t('items.download')}
          </Button>
          <Button size="sm" onClick={close}>
            <Check className="h-4 w-4" />
            {t('common.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
