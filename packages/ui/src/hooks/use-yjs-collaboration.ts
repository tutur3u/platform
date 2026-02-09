import { createClient } from '@tuturuuu/supabase/next/client';
import SupabaseProvider from '@tuturuuu/ui/hooks/supabase-provider';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Awareness } from 'y-protocols/awareness';
import * as Y from 'yjs';

export interface CollaborationUser {
  id: string;
  name: string;
  color: string;
}

export interface YjsCollaborationConfig {
  channel: string;
  tableName: string;
  columnName: string;
  id: string;
  user: CollaborationUser | null;
  enabled?: boolean;
  onSync?: (synced: boolean) => void;
  onError?: (error: Error) => void;
  onSave?: (version: number) => void;
}

export interface YjsCollaborationResult {
  doc: Y.Doc | null;
  awareness: Awareness | null;
  provider: SupabaseProvider | null;
  synced: boolean;
  connected: boolean;
}

/**
 * Hook for managing Yjs collaboration with Supabase Realtime.
 *
 * Uses deferred cleanup so that React StrictMode's double-invoke cycle
 * (mount → cleanup → remount) reuses the existing SupabaseProvider instead
 * of tearing down the Realtime channel and racing with the server.
 */
export function useYjsCollaboration(
  config: YjsCollaborationConfig
): YjsCollaborationResult {
  const {
    channel,
    tableName,
    columnName,
    id,
    user,
    enabled = true,
    onSync,
    onError,
    onSave,
  } = config;

  const [synced, setSynced] = useState(false);
  const [connected, setConnected] = useState(false);
  const providerRef = useRef<SupabaseProvider | null>(null);
  const destroyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref that event listeners check — survives StrictMode cleanup/remount
  const mountedRef = useRef(false);

  // Create Yjs document and awareness (stable references)
  const doc = useMemo(() => (enabled ? new Y.Doc() : null), [enabled]);

  const awareness = useMemo(
    () => (enabled && doc ? new Awareness(doc) : null),
    [enabled, doc]
  );

  // Stabilize callback and user refs — these should never cause provider
  // destruction/recreation.
  const hasUser = !!user;
  const userRef = useRef(user);
  userRef.current = user;
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Provider lifecycle: create/destroy based on channel config
  useEffect(() => {
    if (!enabled || !doc || !awareness || !hasUser) return;

    mountedRef.current = true;

    // ── StrictMode reuse path ───────────────────────────────────────
    // If a pending deferred destruction exists, cancel it and reuse
    // the existing provider. This prevents the Supabase Realtime
    // "leave then immediate re-join" race that causes a 10s timeout.
    if (destroyTimerRef.current) {
      clearTimeout(destroyTimerRef.current);
      destroyTimerRef.current = null;

      if (providerRef.current && !providerRef.current.destroyed) {
        console.log('♻️ Reusing existing SupabaseProvider (StrictMode)');
        return () => {
          mountedRef.current = false;
          // Defer destruction again — if no remount follows within
          // 100ms, the timer will fire and destroy the provider
          const provider = providerRef.current;
          destroyTimerRef.current = setTimeout(() => {
            destroyTimerRef.current = null;
            if (provider && providerRef.current === provider) {
              console.log('🧹 Destroying SupabaseProvider (deferred)');
              provider.destroy();
              providerRef.current = null;
            }
          }, 100);
        };
      }
    }

    // ── Fresh creation path ─────────────────────────────────────────
    // Destroy stale provider from a previous config if present
    if (providerRef.current && !providerRef.current.destroyed) {
      providerRef.current.destroy();
      providerRef.current = null;
    }

    const supabase = createClient();

    // Set initial awareness state
    const currentUser = userRef.current;
    if (currentUser) {
      awareness.setLocalStateField('user', {
        id: currentUser.id,
        name: currentUser.name,
        color: currentUser.color,
      });
    }

    console.log('🔄 Initializing SupabaseProvider for document:', id);

    const provider = new SupabaseProvider(doc, supabase, {
      id: id,
      channel: channel,
      tableName: tableName,
      columnName: columnName,
      awareness,
      resyncInterval: 30000,
      saveDebounceMs: 300,
    });

    providerRef.current = provider;

    // Listen to provider events — use mountedRef so listeners stay valid
    // across StrictMode cleanup/remount without re-registration.
    provider.on('status', ([{ status }]) => {
      if (!mountedRef.current) return;
      console.log('📡 Provider status:', status);
      setConnected(status === 'connected');
    });

    provider.on('synced', ([syncState]) => {
      if (!mountedRef.current) return;
      console.log('🔄 Provider synced:', syncState);
      setSynced(syncState);
      onSyncRef.current?.(syncState);
    });

    provider.on('sync', ([syncState]) => {
      if (!mountedRef.current) return;
      console.log('🔄 Provider sync event:', syncState);
    });

    provider.on('save', (version) => {
      if (!mountedRef.current) return;
      console.log('💾 Document saved to database, version:', version);
      onSaveRef.current?.(version);
    });

    provider.on('error', (providerInstance) => {
      if (!mountedRef.current) return;
      console.error('❌ Provider error:', providerInstance);
      onErrorRef.current?.(new Error('Provider error occurred'));
    });

    provider.on('connect', () => {
      if (!mountedRef.current) return;
      console.log('✅ Provider connected');
    });

    provider.on('disconnect', () => {
      if (!mountedRef.current) return;
      console.log('🔌 Provider disconnected');
      setConnected(false);
      setSynced(false);
    });

    provider.on('dom-error', (error: DOMException) => {
      if (!mountedRef.current) return;
      console.warn(
        '⚠️ DOM reconciliation error handled gracefully:',
        error.message
      );
    });

    // Deferred cleanup — gives StrictMode a chance to cancel and reuse
    return () => {
      mountedRef.current = false;
      const p = providerRef.current;
      destroyTimerRef.current = setTimeout(() => {
        destroyTimerRef.current = null;
        if (p && providerRef.current === p) {
          console.log('🧹 Destroying SupabaseProvider (deferred)');
          p.destroy();
          providerRef.current = null;
        }
      }, 100);
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: hasUser (boolean) guards provider creation; user/callback refs handle identity changes without provider churn
  }, [id, channel, tableName, columnName, hasUser, doc, awareness, enabled]);

  // Awareness update: sync user identity without recreating the provider
  useEffect(() => {
    if (!awareness || !user) return;
    awareness.setLocalStateField('user', {
      id: user.id,
      name: user.name,
      color: user.color,
    });
  }, [awareness, user]);

  return {
    doc,
    awareness,
    provider: providerRef.current,
    synced,
    connected,
  };
}
