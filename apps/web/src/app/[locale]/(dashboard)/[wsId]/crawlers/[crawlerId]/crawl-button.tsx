'use client';

import { Button } from '@tutur3u/ui/button';
import { useState } from 'react';

export default function CrawlButton({
  wsId,
  url,
  onSuccess,
}: {
  wsId: string;
  url: string;
  onSuccess?: () => void;
}) {
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
            body: JSON.stringify({ url }),
          });

          if (!res.ok) {
            console.error('Failed to crawl:', res.statusText);
            return;
          }

          await res.json();
          onSuccess?.();
        } catch (error) {
          console.error('Error during crawl:', error);
        } finally {
          setIsLoading(false);
        }
      }}
      disabled={isLoading}
    >
      {isLoading ? 'Crawling...' : 'Crawl'}
    </Button>
  );
}
