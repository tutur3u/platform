'use client';

import { Check, LinkIcon } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function generateCanonicalMeetUrl(planId: string) {
  return `https://tuturuuu.com/meet/plans/${planId}`;
}

export default function CopyLinkButton({
  url,
  className,
}: {
  url: string;
  className?: string;
}) {
  const t = useTranslations('meet-together-plan-details');
  const [copied, setCopied] = useState(false);

  return (
    <Button
      className={cn(
        'w-full transition active:scale-[0.98] sm:w-auto',
        className
      )}
      variant="outline"
      disabled={!url}
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? (
        <Check className="mr-2 h-4 w-4" />
      ) : (
        <LinkIcon className="mr-2 h-4 w-4" />
      )}
      {copied ? t('copied') : t('copy_link')}
    </Button>
  );
}
