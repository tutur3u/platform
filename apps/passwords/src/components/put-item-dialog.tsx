import { Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { type ChangeEvent, type FormEvent, useState } from 'react';
import { useI18n } from '../i18n/provider';
import { bytesToBase64 } from '../lib/bytes';
import type { PasswordsClientError } from '../service/client-error';
import { putItem } from '../service/functions';
import { PASSWORDS_LIMITS, type VaultSummary } from '../service/port';
import { useGuardedMutation } from './use-guarded-mutation';

interface Props {
  wsId: string;
  vault: VaultSummary;
  onError(error: PasswordsClientError): void;
}

interface PutArgs {
  file: File;
  name: string;
  revision: number;
}

export function PutItemDialog({ wsId, vault, onError }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const tooLarge = (file?.size ?? 0) > PASSWORDS_LIMITS.itemMaxBytes;

  const put = useGuardedMutation({
    write: { wsId, vaultId: vault.id, action: 'item.write' },
    intent: ({ file, name }: PutArgs) =>
      `${name}:${file.name}:${file.size}:${file.lastModified}`,
    run: async ({ file, name, revision }, requestId) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const base64 = bytesToBase64(bytes);
      bytes.fill(0);
      return putItem({
        data: { wsId, vaultId: vault.id, name, base64, revision, requestId },
      });
    },
    onSuccess: () => {
      toast.success(t('items.saved'));
      close();
    },
  });

  function close() {
    setOpen(false);
    setName('');
    setFile(null);
    put.reset();
  }

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const chosen = event.target.files?.[0] ?? null;
    setFile(chosen);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!file || tooLarge) return;
    put.mutate(
      { file, name: name.trim(), revision: vault.revision },
      { onError }
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          {t('items.add')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t('items.add')}</DialogTitle>
            <DialogDescription>{t('items.labelWarning')}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="item-label">{t('items.label')}</Label>
            <Input
              id="item-label"
              value={name}
              maxLength={PASSWORDS_LIMITS.nameMaxLength}
              autoComplete="off"
              required
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="item-file">{t('items.file')}</Label>
            <Input
              id="item-file"
              type="file"
              required
              aria-invalid={tooLarge}
              onChange={choose}
            />
            {tooLarge && (
              <p className="text-destructive text-sm" role="alert">
                {t('items.tooLarge', { limit: '1 MiB' })}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={!file || !name.trim() || tooLarge || put.isPending}
            >
              {t('items.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
