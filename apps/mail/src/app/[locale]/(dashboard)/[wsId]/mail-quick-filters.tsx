'use client';

import { Mail, Paperclip } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Checkbox } from '@tuturuuu/ui/checkbox';
import { useTranslations } from 'next-intl';

export function MailQuickFilters({
  query,
  onQueryChange,
  selection,
  onSelectAll,
  disabled,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  selection: boolean | 'indeterminate';
  onSelectAll: (selected: boolean) => void;
  disabled: boolean;
}) {
  const t = useTranslations('mail');
  const tokens: string[] = query.match(/(?:[^\s"]+|"[^"]*")+/gu) ?? [];
  const toggle = (token: string) => {
    const next = tokens.includes(token)
      ? tokens.filter((item) => item !== token)
      : [...tokens, token];
    onQueryChange(next.filter(Boolean).join(' '));
  };
  return (
    <div className="flex items-center gap-1">
      <Checkbox
        aria-label={t('select_loaded')}
        checked={selection}
        className="mx-2"
        disabled={disabled}
        onCheckedChange={(value) => onSelectAll(value === true)}
      />
      <Button
        aria-pressed={tokens.includes('is:unread')}
        className="h-7 gap-1.5 rounded-md px-2 text-xs"
        onClick={() => toggle('is:unread')}
        size="sm"
        variant={tokens.includes('is:unread') ? 'secondary' : 'ghost'}
      >
        <Mail className="size-3" />
        {t('unread')}
      </Button>
      <Button
        aria-pressed={tokens.includes('has:attachment')}
        className="h-7 gap-1.5 rounded-md px-2 text-xs"
        onClick={() => toggle('has:attachment')}
        size="sm"
        variant={tokens.includes('has:attachment') ? 'secondary' : 'ghost'}
      >
        <Paperclip className="size-3" />
        {t('attachments')}
      </Button>
    </div>
  );
}
