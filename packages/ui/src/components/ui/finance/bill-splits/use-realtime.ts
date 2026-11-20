'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createRealtimeClient } from '@tuturuuu/internal-api/realtime';
import { useEffect, useState } from 'react';

export function useBillSplitRealtime(
  wsId: string,
  splitId: string | undefined,
  enabled: boolean
) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState<string>();
  const topic = splitId ? `finance-bill-split:${wsId}:${splitId}` : undefined;

  useEffect(() => {
    if (!enabled || !topic) return;
    let refresh: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    const client = createRealtimeClient();
    const channel = client.channel(topic, { config: { private: true } });
    function invalidate() {
      if (refresh !== undefined) return;
      refresh = setTimeout(() => {
        refresh = undefined;
        if (active)
          void queryClient.invalidateQueries({
            queryKey: ['bill-splits', wsId, splitId],
          });
      }, 250);
    }
    channel
      .on('broadcast', { event: 'activity' }, invalidate)
      .subscribe((status) => {
        if (!active) return;
        setConnected(status === 'SUBSCRIBED' ? topic : undefined);
        if (status === 'SUBSCRIBED') invalidate();
      });

    return () => {
      active = false;
      if (refresh !== undefined) clearTimeout(refresh);
      void client.removeChannel(channel);
    };
  }, [enabled, queryClient, splitId, topic, wsId]);

  return enabled && Boolean(topic && connected === topic);
}
