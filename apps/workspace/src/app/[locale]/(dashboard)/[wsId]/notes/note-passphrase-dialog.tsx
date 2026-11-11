'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function NotePassphraseDialog({
  mode,
  onClose,
  onSubmit,
}: {
  mode: 'lock' | 'open' | null;
  onClose: () => void;
  onSubmit: (passphrase: string) => Promise<boolean>;
}) {
  const t = useTranslations('notes_app');
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => {
    setPassphrase('');
    setConfirmation('');
    setError('');
    onClose();
  };
  const submit = async () => {
    if (!mode || busy) return;
    if (
      mode === 'lock' &&
      (passphrase.length < 8 || passphrase !== confirmation)
    ) {
      setError(t('passphrase_requirements'));
      return;
    }
    if (!passphrase) return;
    setBusy(true);
    try {
      if (await onSubmit(passphrase)) close();
      else setError(t('incorrect_passphrase'));
    } catch {
      setError(t('save_error'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={mode !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t(mode === 'lock' ? 'lock' : 'open_locked')}
          </DialogTitle>
          <DialogDescription>
            {t(mode === 'lock' ? 'lock_description' : 'open_description')}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Input
            autoFocus
            type="password"
            autoComplete="off"
            aria-label={t('passphrase')}
            placeholder={t('passphrase')}
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
          />
          {mode === 'lock' && (
            <Input
              type="password"
              autoComplete="off"
              aria-label={t('confirm_passphrase')}
              placeholder={t('confirm_passphrase')}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          )}
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" disabled={busy || !passphrase}>
            {t(mode === 'lock' ? 'lock' : 'open_locked')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
