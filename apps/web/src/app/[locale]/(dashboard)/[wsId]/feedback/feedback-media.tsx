'use client';

import { useQuery } from '@tanstack/react-query';
import { getProductFeedbackMedia } from '@tuturuuu/internal-api/product-feedback';
import { Button } from '@tuturuuu/ui/button';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export function FeedbackMedia({ actor, id }: { actor: string; id: string }) {
  const t = useTranslations('product-feedback');
  const [requested, setRequested] = useState(false);
  const media = useQuery({
    queryKey: ['product-feedback', actor, 'media', id],
    queryFn: () => getProductFeedbackMedia(id),
    enabled: requested,
    retry: false,
    gcTime: 0,
  });
  return (
    <div className="mt-4 space-y-2">
      <Button
        variant="outline"
        onClick={() => setRequested(true)}
        disabled={requested}
      >
        {t('view-screenshot')}
      </Button>
      {requested &&
        (media.isError ? (
          <p role="alert">{t('unavailable')}</p>
        ) : media.isPending ? (
          <p role="status">{t('loading')}</p>
        ) : media.data?.media ? (
          <Image
            src={`data:image/webp;base64,${media.data.media.data}`}
            alt={t('screenshot')}
            width={1920}
            height={1920}
            unoptimized
            className="h-auto max-h-96 w-full rounded-md border object-contain"
          />
        ) : (
          <p>{t('no-screenshot')}</p>
        ))}
    </div>
  );
}
