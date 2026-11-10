'use client';

import { AlertTriangle, Check, Copy } from '@tuturuuu/icons';
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
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apiKey: string;
  keyPrefix: string;
  roleName?: string;
  expiresAt?: string | null;
}

export default function KeyDisplayModal({
  open,
  onOpenChange,
  apiKey,
  keyPrefix,
  roleName,
  expiresAt,
}: Props) {
  const t = useTranslations('ws-api-keys');
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    if (confirmed) {
      onOpenChange(false);
      // Reset state for next time
      setTimeout(() => {
        setCopied(false);
        setConfirmed(false);
      }, 300);
    }
  };

  return (
    <Dialog open={open} onOpenChange={confirmed ? onOpenChange : undefined}>
      <DialogContent className="sm:max-w-2xl" showCloseButton={confirmed}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-dynamic-green" />
            {t('key_generated_title')}
          </DialogTitle>
          <DialogDescription className="flex items-start gap-2 rounded-lg border border-dynamic-orange/20 bg-dynamic-orange/10 p-3 text-dynamic-orange">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="text-sm">{t('key_generated_warning')}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="api-key" className="font-semibold text-sm">
              {t('api_key')}
            </Label>
            <div className="flex gap-2">
              <Input
                id="api-key"
                value={apiKey}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleCopy}
                className="shrink-0"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-dynamic-green" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
            {copied && (
              <p className="text-dynamic-green text-xs">{t('copied')}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 rounded-lg border border-border bg-muted/50 p-4">
            <div>
              <Label className="text-muted-foreground text-xs">
                {t('key_prefix')}
              </Label>
              <p className="font-mono text-sm">{keyPrefix}...</p>
            </div>
            {roleName && (
              <div>
                <Label className="text-muted-foreground text-xs">
                  {t('role')}
                </Label>
                <p className="text-sm">{roleName}</p>
              </div>
            )}
            {expiresAt && (
              <div className="col-span-2">
                <Label className="text-muted-foreground text-xs">
                  {t('expires_at')}
                </Label>
                <p className="text-sm">
                  {new Date(expiresAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-border p-3">
            <Checkbox
              id="confirm-saved"
              checked={confirmed}
              onCheckedChange={(checked) => setConfirmed(checked === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor="confirm-saved"
              className="cursor-pointer text-sm leading-tight"
            >
              {t('save_key_confirmation')}
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleClose} disabled={!confirmed}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
