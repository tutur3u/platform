'use client';

import { Copy, KeyRound, RefreshCw, Rocket, Trash2 } from '@tuturuuu/icons';
import type {
  AiStudioApiKey,
  AiStudioKeySecretResponse,
} from '@tuturuuu/internal-api/ai-studio';
import { Button } from '@tuturuuu/ui/button';
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
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { RelativeTimestamp } from './relative-timestamp';

export function ApiKeyField({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

export function ApiKeyRow({
  approvalGranted,
  isPending,
  keyRecord,
  onRevoke,
  onRotate,
}: {
  approvalGranted: boolean;
  isPending: boolean;
  keyRecord: AiStudioApiKey;
  onRevoke: () => void;
  onRotate: () => void;
}) {
  const t = useTranslations('ai-studio.keys');
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-background p-3 transition-colors hover:border-primary/30 hover:bg-muted/30 sm:flex-row sm:items-center">
      <div className="grid size-9 shrink-0 place-items-center rounded-md bg-foreground/5 text-primary">
        <KeyRound className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-sm">{keyRecord.name}</div>
        <div className="font-mono text-muted-foreground text-xs">
          {keyRecord.prefix} · {keyRecord.environment}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-xs">
          <span>
            {t('created')} <RelativeTimestamp value={keyRecord.created_at} />
          </span>
          <span>
            {keyRecord.last_used_at ? (
              <>
                {t('last_used')}{' '}
                <RelativeTimestamp value={keyRecord.last_used_at} />
              </>
            ) : (
              t('never_used')
            )}
          </span>
        </div>
      </div>
      <span
        className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-xs ring-1 ring-inset ${
          keyRecord.revoked_at
            ? 'bg-dynamic-red/10 text-dynamic-red ring-dynamic-red/25'
            : 'bg-dynamic-green/10 text-dynamic-green ring-dynamic-green/25'
        }`}
      >
        <span
          className={`size-1.5 rounded-full ${
            keyRecord.revoked_at ? 'bg-dynamic-red' : 'bg-dynamic-green'
          }`}
        />
        {keyRecord.revoked_at ? t('revoked') : t('active')}
      </span>
      {!keyRecord.revoked_at ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!approvalGranted || isPending}
            onClick={onRotate}
            size="sm"
            variant="outline"
          >
            <RefreshCw className="mr-2 size-3.5" />
            {t('rotate')}
          </Button>
          <Button
            disabled={isPending}
            onClick={onRevoke}
            size="sm"
            variant="outline"
          >
            <Trash2 className="mr-2 size-3.5" />
            {t('revoke')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function ApiKeySecretDialog({
  onClose,
  onUseInPlayground,
  value,
}: {
  onClose: () => void;
  onUseInPlayground: () => void;
  value: AiStudioKeySecretResponse | null;
}) {
  const t = useTranslations('ai-studio.keys');
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open={Boolean(value)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('secret_title')}</DialogTitle>
          <DialogDescription>{t('secret_description')}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={value?.secret ?? ''} />
          <Button
            onClick={async () => {
              if (value?.secret) {
                await navigator.clipboard.writeText(value.secret);
                toast.success(t('copied'));
              }
            }}
            size="icon"
            variant="outline"
          >
            <Copy className="size-4" />
            <span className="sr-only">{t('copy')}</span>
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onUseInPlayground} variant="outline">
            <Rocket className="mr-2 size-4" />
            {t('use_in_playground')}
          </Button>
          <Button onClick={onClose}>{t('done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
