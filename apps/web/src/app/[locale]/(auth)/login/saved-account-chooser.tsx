'use client';

import type { WebAccountSummary } from '@tuturuuu/internal-api/auth';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { CoBrandRow } from './continue-card-parts';
import {
  ConfirmationCard,
  StoredAccountSwitchList,
} from './internal-app-account-confirmation-parts';

/**
 * Lets a device with saved Tuturuuu accounts pick one before any provider
 * redirect. "Use another account" is the only path to the hinted provider.
 */
export function SavedAccountChooser({
  accounts,
  appName,
  onSwitchAccount,
  onUseAnotherAccount,
  switchingAccountId,
}: {
  accounts: WebAccountSummary[];
  /** The requesting app, when the sign-in returns to one. */
  appName: string | null;
  onSwitchAccount: (accountId: string) => void;
  onUseAnotherAccount: () => void;
  switchingAccountId: string | null;
}) {
  const t = useTranslations();
  const disabled = switchingAccountId !== null;

  return (
    <ConfirmationCard>
      {appName ? <CoBrandRow appName={appName} /> : null}
      <div className="flex flex-col gap-1.5 text-center">
        <h2 className="text-balance font-extrabold text-2xl tracking-[-0.02em]">
          {t('login.choose_account_title')}
        </h2>
        {appName ? (
          <p className="text-balance text-muted-foreground text-sm">
            {t('login.choose_account_for_app', { app: appName })}
          </p>
        ) : null}
      </div>

      <StoredAccountSwitchList
        accounts={accounts}
        disabled={disabled}
        fallbackAccountName={t('login.unknown_account')}
        onSwitchAccount={onSwitchAccount}
        separatorLabel={null}
        switchingAccountId={switchingAccountId}
      />

      <Button
        className="h-12 w-full rounded-2xl font-bold"
        disabled={disabled}
        onClick={onUseAnotherAccount}
        type="button"
        variant="outline"
      >
        {t('login.use_another_account')}
      </Button>
    </ConfirmationCard>
  );
}
