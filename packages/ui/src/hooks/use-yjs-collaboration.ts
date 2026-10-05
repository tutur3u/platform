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
  /** Debounce time for broadcasting document updates (0 = immediate). */
  broadcastDebounceMs?: number;
  /** Debounce time for persistence writes (broadcast stays realtime). */
  saveDebounceMs?: number;
  loadDocumentState?: () => Promise<number[] | null>;
  saveDocumentState?: (state: number[]) => Promise<boolean | undefined>;
  onSync?: (synced: boolean) => void;
  onError?: (error: Error) => void;
  onSave?: (version: number) => void;
}

export interface YjsCollaborationResult {
  doc: Y.Doc | null;
  awareness: Awareness | null;
  provider: SupabaseProvider | null;
  synced: boolean;
  hydrated: boolean;
  hydrationFailed: boolean;
  connected: boolean;
}

/**
 * Hook for managing Yjs collaboration with Cloudflare realtime.
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
    broadcastDebounceMs,
    saveDebounceMs,
    loadDocumentState,
    saveDocumentState,
    onSync,
    onError,
    onSave,
  } = config;

  const [hydratedProvider, setHydratedProvider] =
    useState<SupabaseProvider | null>(null);
  const [hydrationErrorProvider, setHydrationErrorProvider] =
    useState<SupabaseProvider | null>(null);
  const [synced, setSynced] = useState(false);
  const [connected, setConnected] = useState(false);
  const [providerState, setProviderState] = useState<SupabaseProvider | null>(
    null
  );
  const providerRef = useRef<SupabaseProvider | null>(null);
  const destroyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref that event listeners check — survives StrictMode cleanup/remount
  const mountedRef = useRef(false);

  const hasUser = !!user;
  // Create the document without starting awareness timers during render.
  const documentScope = JSON.stringify([
    channel,
    tableName,
    columnName,
    id,
    user?.id,
  ]);
  const doc = useMemo(
    () => (enabled && hasUser ? new Y.Doc({ guid: documentScope }) : null),
    [enabled, hasUser, documentScope]
  );

  const awareness =
    providerState && providerState.id === doc?.clientID
      ? providerState.awareness
      : null;

  // Stabilize callback and user refs — these should never cause provider
  // destruction/recreation.
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
    if (!enabled || !doc || !hasUser) return;

    mountedRef.current = true;

    // ── StrictMode reuse path ───────────────────────────────────────
    // If a pending deferred destruction exists, cancel it and reuse
    // the existing provider only when its document identity still matches.
    if (destroyTimerRef.current) {
      clearTimeout(destroyTimerRef.current);
      destroyTimerRef.current = null;

      if (
        providerRef.current &&
        !providerRef.current.destroyed &&
        providerRef.current.id === doc.clientID
      ) {
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
    const awareness = new Awareness(doc);

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
      ownsDocument: true,
      resyncInterval: 30000,
      saveDebounceMs: saveDebounceMs ?? 300,
      loadState: loadDocumentState,
      saveState: saveDocumentState,
      ...(broadcastDebounceMs !== undefined && { broadcastDebounceMs }),
    });

    providerRef.current = provider;
    setProviderState(provider);
    setSynced(false);
    setConnected(false);

    provider.on('hydrated', () => {
      if (!mountedRef.current || providerRef.current !== provider) return;
      // Publish a new state value so hydration is observable without transport.
      setHydratedProvider(provider);
      setHydrationErrorProvider(null);
    });

    // Listen to provider events — use mountedRef so listeners stay valid
    // across StrictMode cleanup/remount without re-registration.
    provider.on('status', ([{ status }]) => {
      if (!mountedRef.current || providerRef.current !== provider) return;
      console.log('📡 Provider status:', status);
      setConnected(status === 'connected');
    });

    provider.on('synced', ([syncState]) => {
      if (!mountedRef.current || providerRef.current !== provider) return;
      console.log('🔄 Provider synced:', syncState);
      setSynced(syncState);
      onSyncRef.current?.(syncState);
    });

    provider.on('sync', ([syncState]) => {
      if (!mountedRef.current || providerRef.current !== provider) return;
      console.log('🔄 Provider sync event:', syncState);
    });

    provider.on('save', (version) => {
      if (!mountedRef.current || providerRef.current !== provider) return;
      console.log('💾 Document saved to database, version:', version);
      onSaveRef.current?.(version);
    });

    provider.on(
      'error',
      (errorInfo: {
        message: string;
        channelError: unknown;
        channel: string;
        status: string;
      }) => {
        if (!mountedRef.current || providerRef.current !== provider) return;
        console.error('❌ Provider error:', {
          message: errorInfo.message,
          channel: errorInfo.channel,
          status: errorInfo.status,
        });
        if (errorInfo.status === 'DOCUMENT_ERROR')
          setHydrationErrorProvider(provider);
        onErrorRef.current?.(new Error(errorInfo.message));
      }
    );

    provider.on('connect', () => {
      if (!mountedRef.current || providerRef.current !== provider) return;
      console.log('✅ Provider connected');
    });

    provider.on('disconnect', () => {
      if (!mountedRef.current || providerRef.current !== provider) return;
      console.log('🔌 Provider disconnected');
      setConnected(false);
      setSynced(false);
    });

    provider.on('dom-error', (error: DOMException) => {
      if (!mountedRef.current || providerRef.current !== provider) return;
      console.warn(
        '⚠️ DOM reconciliation error handled gracefully:',
        error.message
      );
    });

    provider.on('reconnect-failed', () => {
      if (!mountedRef.current || providerRef.current !== provider) return;
      // If page is visible (user is active but network dropped), restart
      // the backoff cycle after a short delay to avoid hammering
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible'
      ) {
        console.warn(
          '⚠️ All reconnect attempts exhausted while page visible — retrying in 5s'
        );
        setTimeout(() => {
          if (
            mountedRef.current &&
            providerRef.current === provider &&
            !provider.destroyed
          ) {
            providerRef.current.resetAndReconnect();
          }
        }, 5000);
      }
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
  }, [
    id,
    channel,
    tableName,
    columnName,
    hasUser,
    doc,
    enabled,
    broadcastDebounceMs,
    saveDebounceMs,
    loadDocumentState,
    saveDocumentState,
  ]);

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
    provider:
      providerState && providerState.id === doc?.clientID
        ? providerState
        : null,
    hydrated:
      !!hydratedProvider &&
      hydratedProvider.id === doc?.clientID &&
      hydratedProvider.hydrated,
    hydrationFailed:
      !!hydrationErrorProvider && hydrationErrorProvider.id === doc?.clientID,
    synced: !!providerState && providerState.id === doc?.clientID && synced,
    connected:
      !!providerState && providerState.id === doc?.clientID && connected,
  };
}
