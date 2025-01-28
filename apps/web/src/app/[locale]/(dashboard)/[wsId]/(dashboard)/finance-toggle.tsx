'use client';

import useSearchParams from '@/hooks/useSearchParams';
import { Checkbox } from '@repo/ui/components/ui/checkbox';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function FinanceToggle() {
  const t = useTranslations();
  const { getSingle, set, remove } = useSearchParams();
  const showFinanceStats = getSingle('showFinanceStats');

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (loading) setLoading(false);
  }, [showFinanceStats]);

  const handleToggle = () => {
    setLoading(true);
    const newValue = !showFinanceStats;

    if (!newValue) {
      remove('showFinanceStats');
      return;
    }

    set({ showFinanceStats: 'true' }, false);
  };

  return (
    <div className="mb-4 flex items-center gap-2">
      <Checkbox
        id="showFinanceStats"
        checked={loading ? 'indeterminate' : !!showFinanceStats}
        onCheckedChange={handleToggle}
        disabled={loading}
      />
      <label
        htmlFor="showFinanceStats"
        className="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
      >
        {t('finance-overview.show-finance-stats')}
      </label>
    </div>
  );
}
