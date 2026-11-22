'use client';

import { useTranslations } from 'next-intl';
import { FinanceSegmentedTabs } from './segmented-tabs';
import { useFinanceBalanceMode } from './use-finance-balance-mode';

export function FinanceBalanceModeToggle() {
  const t = useTranslations('wallet-checkpoints');
  const { mode, setMode } = useFinanceBalanceMode();

  return (
    <FinanceSegmentedTabs
      value={mode}
      onValueChange={setMode}
      label={t('balance_mode')}
      options={[
        { value: 'ledger', label: t('ledger'), ariaLabel: t('ledger_mode') },
        {
          value: 'audited',
          label: t('audited'),
          ariaLabel: t('audited_mode'),
        },
      ]}
    />
  );
}
