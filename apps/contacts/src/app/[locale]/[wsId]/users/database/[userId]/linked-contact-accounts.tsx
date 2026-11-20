'use client';

import { useMutation } from '@tanstack/react-query';
import {
  encodePathSegment,
  getInternalApiClient,
} from '@tuturuuu/internal-api/client';
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
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LinkedContactAccounts({
  accounts,
  actorId,
  canUpdateUsers,
  contactId,
  workspaceId,
}: {
  accounts: { id: string; display_name: string | null }[];
  actorId: string;
  canUpdateUsers: boolean;
  contactId: string;
  workspaceId: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const unlink = useMutation({
    mutationFn: (accountId: string) =>
      getInternalApiClient().json<{ outcome: 'unlinked' }>(
        `/api/v1/workspaces/${encodePathSegment(workspaceId)}/users/links/repair`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'unlink',
            workspaceUserId: contactId,
            platformAccountId: accountId,
          }),
        }
      ),
    onSuccess: () => {
      setSelected(null);
      router.refresh();
    },
    onError: () => toast.error(t('common.error')),
  });

  return (
    <section className="space-y-2 rounded-lg border p-4">
      <h2 className="font-medium">{t('user-data-table.linked_accounts')}</h2>
      <ul className="divide-y">
        {accounts.map((account) => (
          <li
            key={account.id}
            className="flex items-center justify-between gap-2 py-2"
          >
            <span>{account.display_name?.trim() || t('common.unknown')}</span>
            {(canUpdateUsers || account.id === actorId) && (
              <Dialog
                open={selected === account.id}
                onOpenChange={(open) => setSelected(open ? account.id : null)}
              >
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    {t('user-data-table.unlink_account')}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {t('user-data-table.unlink_account')}
                    </DialogTitle>
                    <DialogDescription>
                      {t('user-data-table.unlink_account_confirmation')}
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="destructive"
                      disabled={unlink.isPending}
                      onClick={() => unlink.mutate(account.id)}
                    >
                      {t('user-data-table.unlink_account')}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
