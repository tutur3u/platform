'use client';
import { Ban } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';

type Recipient = { email: string; blocked: boolean; reason?: string | null };
const reasonKeys: Record<string, string> = {
  'Inactive/Abandoned': 'inactive',
  'Verification Failed': 'verification_failed',
  'Spam/Phishing': 'spam',
  'Policy Violation': 'policy_violation',
  'Fraud/Abuse': 'fraud',
};

export function MailBlacklistStatus({
  recipients,
  compact = false,
}: {
  recipients: Recipient[];
  compact?: boolean;
}) {
  const t = useTranslations('mail');
  const blocked = recipients.filter((item) => item.blocked);
  if (!blocked.length) return null;
  const reasonLabel = (value?: string | null) => {
    if (!value) return '';
    const key =
      reasonKeys[value] ??
      (Object.values(reasonKeys).includes(value) ? value : null);
    return key ? t(`blacklist_reason_${key}`) : value;
  };
  const label =
    recipients.length === 1
      ? t('blacklisted')
      : t('blacklisted_count', {
          count: blocked.length,
          total: recipients.length,
        });
  const reason = blocked.length === 1 ? reasonLabel(blocked[0]?.reason) : '';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          tabIndex={0}
          className="max-w-full gap-1.5 border-destructive/25 bg-destructive/10 px-2 py-1 font-semibold text-destructive text-xs"
          variant="outline"
        >
          <Ban className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 break-words">
            {label}
            {!compact && reason ? ` · ${reason}` : ''}
          </span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-80 break-words">
        {blocked.map((item) => (
          <p key={item.email}>
            {item.email}
            {item.reason ? ` · ${reasonLabel(item.reason)}` : ''}
          </p>
        ))}
      </TooltipContent>
    </Tooltip>
  );
}
