'use client';

import { Button } from '@repo/ui/components/ui/button';
import { Check, LinkIcon } from 'lucide-react';
import useTranslation from 'next-translate/useTranslation';
import { useEffect, useState } from 'react';

export default function CopyLinkButton({ url }: { url: string }) {
  const { t } = useTranslation('meet-together-plan-details');
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
      className="w-full md:w-auto"
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
