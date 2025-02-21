'use client';

import { Button } from '@tutur3u/ui/button';
import { cn } from '@tutur3u/utils/format';
import { Check, LinkIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

export default function CopyLinkButton({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const t = useTranslations('meet-together-plan-details');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (copied) {
      setTimeout(() => {
        setCopied(false);
      }, 3000);
    }
  }, [copied]);

  return (
    <Button
      onClick={() => {
        navigator.clipboard.writeText(url);
        setCopied(true);
      }}
      className={cn('w-full md:w-auto', className)}
      disabled={copied || !url}
    >
      {copied ? (
        <Check className="mr-1 h-5 w-5" />
      ) : (
        <LinkIcon className="mr-1 h-5 w-5" />
      )}
      {t('copy_link')}
    </Button>
  );
}
