'use client';

import { KeyRound, Loader2, ShieldCheck } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import type { useTranslations } from 'next-intl';

export function ValseaKeyDialog({
  apiKey,
  isValidating,
  onApiKeyChange,
  onOpenChange,
  onSubmit,
  open,
  t,
  validationError,
}: {
  apiKey: string;
  isValidating: boolean;
  onApiKeyChange: (value: string) => void;
  onOpenChange: (value: boolean) => void;
  onSubmit: () => void;
  open: boolean;
  t: ReturnType<typeof useTranslations>;
  validationError?: string;
}) {
  const trimmedKey = apiKey.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border-dynamic-green/30 bg-background p-0 sm:max-w-xl">
        <div className="bg-dynamic-green/8 p-6">
          <DialogHeader className="space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-md border border-dynamic-green/25 bg-dynamic-green/10 text-dynamic-green">
              <KeyRound className="h-5 w-5" />
            </div>
            <DialogTitle className="text-2xl">
              {t('key_dialog_title')}
            </DialogTitle>
            <DialogDescription className="text-base leading-7">
              {t('key_dialog_description')}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="space-y-5 p-6">
          <div className="space-y-2">
            <Label htmlFor="valsea-key-dialog-input">{t('byok_label')}</Label>
            <Input
              autoComplete="off"
              autoFocus
              id="valsea-key-dialog-input"
              onChange={(event) => onApiKeyChange(event.target.value)}
              placeholder={t('byok_placeholder')}
              type="password"
              value={apiKey}
            />
            <p className="text-foreground/60 text-sm leading-6">
              {t('key_dialog_hint')}
            </p>
            {validationError ? (
              <p className="rounded-md border border-dynamic-red/25 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-sm">
                {validationError}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 rounded-md border border-foreground/10 bg-foreground/4 p-4 text-sm sm:grid-cols-[auto_1fr]">
            <ShieldCheck className="h-5 w-5 text-dynamic-green" />
            <p className="text-foreground/70 leading-6">{t('byok_hint')}</p>
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t('key_dialog_cancel')}
            </Button>
            <Button disabled={!trimmedKey || isValidating} onClick={onSubmit}>
              {isValidating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {isValidating ? t('key_dialog_validating') : t('key_dialog_save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
