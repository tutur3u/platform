'use client';

import { useQuery } from '@tanstack/react-query';
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  type MiraTempAuthBody,
  prefetchMiraTempAuth,
} from './mira-temp-auth-client';

const ACTIVE_WINDOW_MS = 60_000;

export function useMiraTempAuthPrefetch(
  body: MiraTempAuthBody,
  enabled: boolean,
  panelRef: RefObject<HTMLDivElement | null>
) {
  const [visible, setVisible] = useState(false);
  const lastActivity = useRef(Date.now());
  useEffect(() => {
    let intersecting = false;
    const update = () => {
      const nextVisible =
        intersecting && document.visibilityState === 'visible';
      if (nextVisible) lastActivity.current = Date.now();
      setVisible(nextVisible);
    };
    const observer = new IntersectionObserver(([entry]) => {
      intersecting = entry?.isIntersecting ?? false;
      if (intersecting) lastActivity.current = Date.now();
      update();
    });
    if (panelRef.current) observer.observe(panelRef.current);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [panelRef]);

  const { wsId, creditWsId, creditSource } = body;
  const query = useQuery({
    queryKey: ['mira-temp-auth-ready', wsId, creditWsId, creditSource],
    queryFn: () => {
      if (
        document.visibilityState !== 'visible' ||
        Date.now() - lastActivity.current >= ACTIVE_WINDOW_MS
      )
        return null;
      return prefetchMiraTempAuth({ wsId, creditWsId, creditSource });
    },
    enabled: enabled && visible,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => {
      const expiresAt = query.state.data;
      if (
        !enabled ||
        !visible ||
        !expiresAt ||
        Date.now() - lastActivity.current >= ACTIVE_WINDOW_MS
      )
        return false;
      return Math.max(1_000, expiresAt - Date.now() - 5_000);
    },
    gcTime: 0,
  });
  const { refetch } = query;
  return useCallback(() => {
    lastActivity.current = Date.now();
    if (enabled && visible) void refetch();
  }, [enabled, visible, refetch]);
}
