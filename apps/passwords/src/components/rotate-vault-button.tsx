import { RefreshCw } from '@tuturuuu/icons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useI18n } from '../i18n/provider';
import type { PasswordsClientError } from '../service/client-error';
import { rotateVault } from '../service/functions';
import type { VaultSummary } from '../service/port';
import { useGuardedMutation } from './use-guarded-mutation';

interface Props {
  wsId: string;
  vault: VaultSummary;
  onError(error: PasswordsClientError): void;
}

export function RotateVaultButton({ wsId, vault, onError }: Props) {
  const { t } = useI18n();
  const rotate = useGuardedMutation({
    write: { wsId, vaultId: vault.id, action: 'vault.rotate' },
    intent: (args: { revision: number }) => String(args.revision),
    run: (args, requestId) =>
      rotateVault({
        data: { wsId, vaultId: vault.id, revision: args.revision, requestId },
      }),
    onSuccess: () => toast.success(t('vault.rotated')),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={rotate.isPending}>
          <RefreshCw className="h-4 w-4" />
          {t('vault.rotate')}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('vault.rotateTitle', { name: vault.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('vault.rotateBody')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              rotate.mutate({ revision: vault.revision }, { onError })
            }
          >
            {t('vault.rotate')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
