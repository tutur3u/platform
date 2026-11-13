import { Check, ClipboardCopy, ClipboardList } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

export function CopyButton({
  text,
  icon,
}: {
  text: string;
  icon?: 'copy' | 'json';
}) {
  const t = useTranslations('dashboard.mira_chat');
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!navigator.clipboard?.writeText) {
      setCopied(false);
      return;
    }

    void navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
      })
      .catch(() => {
        setCopied(false);
      });
  }, [text]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const isJson = icon === 'json';

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        'rounded-md p-1 transition-all',
        'opacity-0 group-hover:opacity-100',
        'text-muted-foreground hover:bg-foreground/10 hover:text-foreground',
        copied && 'text-dynamic-green opacity-100 hover:text-dynamic-green'
      )}
      title={isJson ? t('copy_raw_json') : t('copy_message')}
    >
      {copied ? (
        <Check className="h-3 w-3" />
      ) : isJson ? (
        <ClipboardList className="h-3 w-3" />
      ) : (
        <ClipboardCopy className="h-3 w-3" />
      )}
    </button>
  );
}
