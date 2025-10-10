import type { RealtimeChannel } from '@supabase/supabase-js';
import type { JSONContent } from '@tiptap/react';
import { createClient } from '@tuturuuu/supabase/next/client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';
import { SupabaseRealtimeProvider } from './supabase-realtime-provider';

export interface CollaborationUser {
  id: string;
  name: string;
  color: string;
}

export interface YjsCollaborationConfig {
  channelName: string;
  user: CollaborationUser | null;
  initialContent?: JSONContent | null;
  enabled?: boolean;
  onSync?: (synced: boolean) => void;
  onError?: (error: Error) => void;
}

export interface YjsCollaborationResult {
  doc: Y.Doc | null;
  awareness: Awareness | null;
  provider: SupabaseRealtimeProvider | null;
  channel: RealtimeChannel | null;
  synced: boolean;
}

/**
 * Hook for managing Yjs collaboration with Supabase Realtime
 */
export function useYjsCollaboration(
  config: YjsCollaborationConfig
): YjsCollaborationResult {
  const {
    channelName,
    user,
    initialContent,
    enabled = true,
    onSync,
    onError,
  } = config;
  const [initialContentState, setInitialContentState] =
    useState(initialContent);
  const [synced, setSynced] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const providerRef = useRef<SupabaseRealtimeProvider | null>(null);

  // Create Yjs document and awareness (stable references)
  const doc = useMemo(() => (enabled ? new Y.Doc() : null), [enabled]);

  const awareness = useMemo(
    () => (enabled && doc ? new Awareness(doc) : null),
    [enabled, doc]
  );

  useEffect(() => {
    if (!initialContent) return;

    setInitialContentState(initialContent);
  }, [initialContent]);

  useEffect(() => {
    if (!enabled || !doc || !awareness || !user) return;

    const supabase = createClient();
    let mounted = true;

    // Set local awareness state with user info
    awareness.setLocalStateField('user', {
      id: user.id,
      name: user.name,
      color: user.color,
    });

    // Create Supabase realtime channel with presence tracking
    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false, ack: false },
        presence: { key: user.id },
      },
    });

    channelRef.current = channel;

    // Subscribe to channel
    channel
      .on('presence', { event: 'sync' }, () => {
        if (!mounted) return;

        // Check for other users AFTER presence is synced
        const presenceState = channel.presenceState();
        const userIds = Object.keys(presenceState);
        const hasOtherUsers =
          userIds.length > 1 ||
          (userIds.length === 1 && userIds[0] !== user.id);

        // Only initialize if provider exists and hasn't been initialized yet
        if (providerRef.current) {
          if (!hasOtherUsers) {
            // First user - initialize with content from database
            console.log('👤 First user - initializing content from database');
            providerRef.current.initializeContent(initialContentState);
          } else {
            // Other users exist - request their current document state
            console.log('👥 Other users present - requesting document state');
            providerRef.current.requestState();
          }
        }
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (!mounted) return;
        console.log('👋 User joined:', key, newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        if (!mounted) return;
        console.log('👋 User left:', key, leftPresences);
      })
      .subscribe(async (status) => {
        if (!mounted) return;

        console.log('📡 Yjs collaboration channel status:', status);

        if (status === 'SUBSCRIBED') {
          // Track our presence
          await channel.track({
            user_id: user.id,
            user_name: user.name,
            online_at: new Date().toISOString(),
          });

          // Initialize provider after channel is ready
          const provider = new SupabaseRealtimeProvider({
            channel,
            doc,
            awareness,
            onSync: (syncStatus) => {
              if (!mounted) return;
              setSynced(syncStatus);
              onSync?.(syncStatus);
            },
            onError: (error) => {
              if (!mounted) return;
              console.error('Collaboration error:', error);
              onError?.(error);
            },
          });

          providerRef.current = provider;
        }
      });

    // Cleanup
    return () => {
      mounted = false;

      // Destroy provider
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }

      // Unsubscribe from channel
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [
    enabled,
    channelName,
    user,
    doc,
    awareness,
    initialContentState,
    onSync,
    onError,
  ]);

  return {
    doc,
    awareness,
    provider: providerRef.current,
    channel: channelRef.current,
    synced,
  };
}
