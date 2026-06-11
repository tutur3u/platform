'use client';

import { useTranslations } from 'next-intl';
import { ToggleGroup, ToggleGroupItem } from '../../toggle-group';
import {
  type FinanceBalanceMode,
  useFinanceBalanceMode,
} from './use-finance-balance-mode';

export function FinanceBalanceModeToggle() {
  const t = useTranslations('wallet-checkpoints');
  const { mode, setMode } = useFinanceBalanceMode();

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={mode}
      onValueChange={(value) => {
        if (value === 'ledger' || value === 'audited') {
          setMode(value as FinanceBalanceMode);
        }
      }}
      aria-label={t('balance_mode')}
    >
      <ToggleGroupItem value="ledger" aria-label={t('ledger_mode')}>
        {t('ledger')}
      </ToggleGroupItem>
      <ToggleGroupItem value="audited" aria-label={t('audited_mode')}>
        {t('audited')}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
