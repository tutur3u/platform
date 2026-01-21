'use client';

import { Shield } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import WalletRoleAccess from './wallet-role-access';

interface Props {
  wsId: string;
  walletId: string;
}

export default function WalletRoleAccessDialog({ wsId, walletId }: Props) {
  const t = useTranslations();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto">
          <Shield className="mr-2 h-4 w-4" />
          {t('ws-wallets.role_access')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('ws-wallets.role_access')}</DialogTitle>
          <DialogDescription>
            {t('ws-wallets.role_access_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4">
          <WalletRoleAccess wsId={wsId} walletId={walletId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
