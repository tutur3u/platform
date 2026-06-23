'use client';

import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

type EmailBlacklistQuickReasonsProps = {
  disabled?: boolean;
  onSelect: (reason: string) => void;
};

const QUICK_REASONS = [
  'quick-reason-spam',
  'quick-reason-policy-violation',
  'quick-reason-fraud',
  'quick-reason-inactive',
  'quick-reason-verification-failed',
  'quick-reason-competitor',
] as const;

export function EmailBlacklistQuickReasons({
  disabled,
  onSelect,
}: EmailBlacklistQuickReasonsProps) {
  const t = useTranslations();

  return (
    <div className="space-y-3">
      <div className="font-medium text-sm">
        {t('email-blacklist.quick-reasons')}
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK_REASONS.map((reason) => (
          <Button
            className="text-xs"
            disabled={disabled}
            key={reason}
            onClick={() => onSelect(t(`email-blacklist.${reason}`))}
            size="sm"
            type="button"
            variant="outline"
          >
            {t(`email-blacklist.${reason}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}
