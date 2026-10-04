'use client';
import { useQuery } from '@tanstack/react-query';
import type { MeetingDocumentJoin } from '@tuturuuu/internal-api/meet-call';
import { DocumentEditor } from '@tuturuuu/meet-core/features/call/components/document-panel';
import {
  type meetingProgrammingApi,
  ProgrammingPanel,
} from '@tuturuuu/meet-core/features/call/components/programming-panel';
import type { MeetingProgramming } from '@tuturuuu/realtime/meet';
import { Button } from '@tuturuuu/ui/button';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

let nonce: string | null = null;
interface NativeBridge {
  callHandler(name: string, ...args: unknown[]): Promise<unknown>;
}
async function nativeRequest<T>(action: string, payload?: unknown): Promise<T> {
  const bridge = (window as Window & { flutter_inappwebview?: NativeBridge })
    .flutter_inappwebview;
  if (!bridge || !/^[a-f0-9]{64}$/.test(nonce ?? ''))
    throw new Error('Native collaboration bridge unavailable');
  return bridge.callHandler(
    'meetCollaboration',
    nonce,
    action,
    payload
  ) as Promise<T>;
}
const api: typeof meetingProgrammingApi = {
  read: () => nativeRequest('programming'),
  select: (_id, payload) => nativeRequest('select', payload),
  create: (_id, payload) => nativeRequest('create', payload),
  run: (_id, payload) => nativeRequest('run', payload),
  readRun: (_id, id) => nativeRequest('readRun', { id }),
  test: (_id, payload) => nativeRequest('test', payload),
  readTest: (_id, id) => nativeRequest('readTest', { id }),
  checkpoint: () => nativeRequest('checkpoint'),
};
export function NativeCollaboration() {
  const query = useSearchParams();
  const meetingId = query.get('meetingId') ?? '';
  const t = useTranslations('meet.collaboration');
  const programmingT = useTranslations('programmingPlayground');
  const [ready, setReady] = useState(false);
  const [programming, setProgramming] = useState(false);
  const [selection, setSelection] = useState<MeetingProgramming | null>(null);
  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    if (fragment) nonce = fragment;
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`
    );
    const available = () => setReady(true);
    window.addEventListener('flutterInAppWebViewPlatformReady', available);
    if (
      (window as Window & { flutter_inappwebview?: NativeBridge })
        .flutter_inappwebview
    )
      available();
    const state = (event: Event) =>
      setSelection(
        (event as CustomEvent<{ programming?: MeetingProgramming }>).detail
          ?.programming ?? null
      );
    window.addEventListener('tuturuuu:meeting-settings', state);
    return () => {
      window.removeEventListener('flutterInAppWebViewPlatformReady', available);
      window.removeEventListener('tuturuuu:meeting-settings', state);
    };
  }, []);
  const document = useQuery({
    queryKey: ['native-meeting-document', meetingId],
    queryFn: () => nativeRequest<MeetingDocumentJoin>('document'),
    enabled: ready,
    retry: false,
  });
  const room = useQuery({
    queryKey: ['native-meeting-context', meetingId],
    queryFn: () =>
      nativeRequest<{
        canManage: boolean;
        programming: MeetingProgramming | null;
        previewBaseUrl: string;
      }>('room'),
    enabled: ready,
    retry: false,
  });
  if (!document.data || !room.data)
    return (
      <p className="p-4 text-muted-foreground">
        {document.isError || room.isError ? t('unavailable') : t('connecting')}
      </p>
    );
  return (
    <div className="flex h-dvh flex-col gap-2 p-2">
      <nav className="flex gap-2">
        <Button
          variant={programming ? 'outline' : 'secondary'}
          onClick={() => setProgramming(false)}
        >
          {t('document')}
        </Button>
        <Button
          variant={programming ? 'secondary' : 'outline'}
          onClick={() => setProgramming(true)}
        >
          {programmingT('coding')}
        </Button>
      </nav>
      <main className="min-h-0 flex-1">
        {programming ? (
          <ProgrammingPanel
            meetingId={meetingId}
            canManage={room.data.canManage}
            selection={selection ?? room.data.programming}
            api={api}
            previewUrl={(port) => `${room.data.previewBaseUrl}${port}/`}
          />
        ) : (
          <DocumentEditor
            meetingId={meetingId}
            initial={document.data}
            join={() => nativeRequest<MeetingDocumentJoin>('document')}
          />
        )}
      </main>
    </div>
  );
}
