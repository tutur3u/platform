'use client';

import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function CrawlButton({
  id,
  wsId,
  url,
}: {
  id?: string;
  wsId: string;
  url: string;
}) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  return (
    <Button
      onClick={async () => {
        try {
          setIsLoading(true);
          const res = await fetch(`/api/v1/workspaces/${wsId}/crawl`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ id, url }),
          });

          if (!res.ok) {
            console.error('Failed to crawl:', res.statusText);
            return;
          }

          await res.json();
          router.refresh();
        } catch (error) {
          console.error('Error during crawl:', error);
          setIsLoading(false);
        }
      }}
      variant={isLoading ? 'secondary' : undefined}
      disabled={isLoading}
    >
      {isLoading ? <LoadingIndicator /> : 'Crawl'}
    </Button>
  );
}
