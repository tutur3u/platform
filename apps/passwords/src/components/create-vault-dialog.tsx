import { useNavigate } from '@tanstack/react-router';
import { Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { type FormEvent, useState } from 'react';
import { useI18n } from '../i18n/provider';
import { createVault } from '../service/functions';
import { PASSWORDS_LIMITS } from '../service/port';
import { useGuardedMutation } from './use-guarded-mutation';

export function CreateVaultDialog({ wsId }: { wsId: string }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const create = useGuardedMutation({
    write: { wsId, action: 'vault.create' },
    intent: (args: { name: string }) => args.name,
    run: (args, requestId) =>
      createVault({ data: { wsId, name: args.name, requestId } }),
    onSuccess: ({ vaultId }) => {
      toast.success(t('vault.created'));
      setOpen(false);
      setName('');
      void navigate({ to: '.', search: { vault: vaultId } });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate({ name: name.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <Plus className="h-4 w-4" />
          {t('vault.create')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{t('vault.create')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="vault-name">{t('vault.name')}</Label>
            <Input
              id="vault-name"
              value={name}
              maxLength={PASSWORDS_LIMITS.nameMaxLength}
              autoComplete="off"
              required
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {t('vault.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
