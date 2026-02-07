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
  /** Workspace tier — used to control broadcast debounce (free = 2s, paid = immediate) */
  tier?: string | null;
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
 * Hook for managing Yjs collaboration with Supabase Realtime
 * Uses y-supabase provider for automatic document syncing
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
    tier,
    onSync,
    onError,
    onSave,
  } = config;

  const [synced, setSynced] = useState(false);
  const [connected, setConnected] = useState(false);
  const providerRef = useRef<SupabaseProvider | null>(null);

  // Create Yjs document and awareness (stable references)
  const doc = useMemo(() => (enabled ? new Y.Doc() : null), [enabled]);

  const awareness = useMemo(
    () => (enabled && doc ? new Awareness(doc) : null),
    [enabled, doc]
  );

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

    console.log('🔄 Initializing SupabaseProvider for document:', id);

    // Free tier: 2s broadcast debounce to reduce realtime costs; paid: immediate
    const broadcastDebounceMs = !tier || tier === 'FREE' ? 2000 : 0;

    // Create SupabaseProvider - it handles everything internally
    const provider = new SupabaseProvider(doc, supabase, {
      id: id,
      channel: channel,
      tableName: tableName,
      columnName: columnName,
      awareness,
      resyncInterval: 30000,
      saveDebounceMs: 300, // Faster saves for better UX
      broadcastDebounceMs,
    });

    providerRef.current = provider;

    // Listen to provider events
    provider.on('status', ([{ status }]) => {
      if (!mounted) return;
      console.log('📡 Provider status:', status);
      setConnected(status === 'connected');
    });

    provider.on('synced', ([syncState]) => {
      if (!mounted) return;
      console.log('🔄 Provider synced:', syncState);
      setSynced(syncState);
      onSync?.(syncState);
    });

    provider.on('sync', ([syncState]) => {
      if (!mounted) return;
      console.log('🔄 Provider sync event:', syncState);
    });

    provider.on('save', (version) => {
      if (!mounted) return;
      console.log('💾 Document saved to database, version:', version);
      onSave?.(version);
    });

    provider.on('error', (providerInstance) => {
      if (!mounted) return;
      console.error('❌ Provider error:', providerInstance);
      onError?.(new Error('Provider error occurred'));
    });

    provider.on('connect', () => {
      if (!mounted) return;
      console.log('✅ Provider connected');
    });

    provider.on('disconnect', () => {
      if (!mounted) return;
      console.log('🔌 Provider disconnected');
      setConnected(false);
      setSynced(false);
    });

    // Handle DOM reconciliation errors that can occur after AFK reconnection
    // This happens when ProseMirror/Tiptap DOM state conflicts with React
    provider.on('dom-error', (error: DOMException) => {
      if (!mounted) return;
      console.warn(
        '⚠️ DOM reconciliation error handled gracefully:',
        error.message
      );
      // The error has been caught and logged - the editor should continue working
      // The user may need to click in the editor to re-sync cursor position
    });

    // Cleanup
    return () => {
      mounted = false;
      console.log('🧹 Cleaning up SupabaseProvider');

      // Destroy provider - it handles all cleanup internally
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
    };
  }, [
    id,
    channel,
    tableName,
    columnName,
    user,
    doc,
    awareness,
    enabled,
    tier,
    onSync,
    onError,
    onSave,
  ]);

  return {
    doc,
    awareness,
    provider: providerRef.current,
    synced,
    connected,
  };
}
