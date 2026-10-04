'use client';
import { useQuery } from '@tanstack/react-query';
import type { ProgrammingCollaborationJoin } from '@tuturuuu/internal-api/playgrounds';
import {
  type CollaborationPresence,
  ProgrammingCollaborationClient,
  programmingDocumentSnapshot,
} from '@tuturuuu/realtime';
import { useEffect, useState } from 'react';
export function useProgrammingRoom(
  key: string,
  join: () => Promise<ProgrammingCollaborationJoin>
) {
  const ticket = useQuery({
    queryKey: ['programming-room-ticket', key],
    queryFn: join,
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
    retry: false,
    gcTime: 0,
  });
  const [status, setStatus] = useState<'connecting' | 'open' | 'offline'>(
    'connecting'
  );
  const [presence, setPresence] = useState<CollaborationPresence[]>([]);
  const [snapshot, setSnapshot] = useState<{
    files: { path: string; content: string }[];
    command: string;
  }>({ files: [], command: '' });
  const [saveError, setSaveError] = useState(false);
  const [savedRevision, setSavedRevision] = useState<number | null>(null);
  const [client, setClient] = useState<ProgrammingCollaborationClient | null>(
    null
  );
  // The room key is an isolation boundary even when the transport implementation is identical.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Recreate the document when its authorized room changes.
  useEffect(() => {
    setStatus('connecting');
    setPresence([]);
    setSnapshot({ files: [], command: '' });
    setSavedRevision(null);
    setSaveError(false);
    const instance = new ProgrammingCollaborationClient((event) => {
      if (event.status) setStatus(event.status);
      if (event.presence) setPresence(event.presence);
      if (event.saveError !== undefined) setSaveError(event.saveError);
      if (event.savedRevision !== undefined)
        setSavedRevision(event.savedRevision);
    });
    setClient(instance);
    const changed = () => {
      setSnapshot(programmingDocumentSnapshot(instance.doc));
      setSavedRevision(null);
    };
    instance.doc.on('update', changed);
    return () => {
      instance.doc.off('update', changed);
      instance.destroy();
    };
  }, [key]);
  useEffect(() => {
    if (ticket.data && client)
      client.connect(ticket.data.endpoint, ticket.data.token);
  }, [client, ticket.data]);
  return {
    client,
    ticket,
    snapshot,
    status,
    presence,
    saveError,
    savedRevision,
  };
}
