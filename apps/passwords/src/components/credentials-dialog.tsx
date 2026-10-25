import { useMutation } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';
import { useI18n } from '../i18n/provider';
import { base64ToBytes } from '../lib/bytes';
import { credentialJournal } from '../lib/credential-journal';
import { saveBytes } from '../lib/save-file';
import {
  asClientError,
  PasswordsClientError,
  unwrap,
} from '../service/client-error';
import { downloadCredentials, observeOperation } from '../service/functions';
import type { CredentialInput, VaultDetail } from '../service/port';
import { StepUpNotice } from './step-up-notice';

export function CredentialsDialog({
  wsId,
  vault,
}: {
  wsId: string;
  vault: VaultDetail;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(vault.items.map((item) => item.id));
  const [access, setAccess] = useState('read');
  const mutation = useMutation<
    { base64: string },
    PasswordsClientError,
    'owner' | 'agent'
  >({
    gcTime: 0,
    retry: false,
    mutationFn: async (kind: 'owner' | 'agent') => {
      let journal: ReturnType<typeof credentialJournal> | undefined;
      let input: CredentialInput = {
        kind: 'owner',
        wsId,
        vaultId: vault.summary.id,
      };
      if (kind === 'agent') {
        try {
          journal = credentialJournal(localStorage, wsId, vault.summary.id);
          if (
            await journal.reconcile(async (targetRequestId) =>
              unwrap(
                await observeOperation({
                  data: { wsId, vaultId: vault.summary.id, targetRequestId },
                })
              )
            )
          )
            throw new PasswordsClientError('REVISION_CONFLICT');
          const ids = {
            grantRequestId: crypto.randomUUID(),
            tokenRequestId: crypto.randomUUID(),
          };
          journal.begin(ids);
          input = {
            kind,
            wsId,
            vaultId: vault.summary.id,
            ...ids,
            itemIds: selected,
            scopes:
              access === 'read'
                ? ['item.read']
                : access === 'write'
                  ? ['item.write']
                  : ['item.read', 'item.write'],
          };
        } catch (error) {
          throw error instanceof PasswordsClientError
            ? error
            : new PasswordsClientError('OPERATION_UNCERTAIN');
        }
      }
      try {
        const value = unwrap(await downloadCredentials({ data: input }));
        journal?.clear();
        return value;
      } catch (error) {
        const failure = asClientError(error, kind === 'agent');
        if (failure.code !== 'OPERATION_UNCERTAIN') journal?.clear();
        throw failure;
      }
    },
    onSuccess: (value) => {
      const bytes = base64ToBytes(value.base64);
      try {
        saveBytes(bytes, 'ttr-passwords.json');
      } finally {
        bytes.fill(0);
      }
      mutation.reset();
      setOpen(false);
    },
    onError: (error) => {
      if (error.code !== 'STEP_UP_REQUIRED')
        toast.error(t(`errors.${error.code}`));
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t('credentials.title')}
        </Button>
      </DialogTrigger>
      <DialogContent className="grid gap-4">
        <DialogHeader>
          <DialogTitle>{t('credentials.title')}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-sm">
          {t('credentials.permissions')}
        </p>
        {mutation.error?.stepUpUrl && (
          <StepUpNotice url={mutation.error.stepUpUrl} />
        )}
        <Button
          disabled={mutation.isPending}
          onClick={() => mutation.mutate('owner')}
        >
          {t('credentials.owner')}
        </Button>
        <fieldset className="grid gap-2">
          <legend className="mb-2 font-medium">{t('credentials.items')}</legend>
          {vault.items.map((item) => (
            <Label key={item.id} className="flex items-center gap-2">
              <Checkbox
                checked={selected.includes(item.id)}
                onCheckedChange={(checked) =>
                  setSelected((previous) =>
                    checked
                      ? [...previous, item.id]
                      : previous.filter((id) => id !== item.id)
                  )
                }
              />
              {item.name}
            </Label>
          ))}
        </fieldset>
        <Select value={access} onValueChange={setAccess}>
          <SelectTrigger aria-label={t('credentials.access')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['read', 'write', 'both'] as const).map((value) => (
              <SelectItem key={value} value={value}>
                {t(`credentials.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          disabled={
            mutation.isPending ||
            selected.length === 0 ||
            vault.summary.rotationRequired
          }
          onClick={() => mutation.mutate('agent')}
        >
          {t('credentials.agent')}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
