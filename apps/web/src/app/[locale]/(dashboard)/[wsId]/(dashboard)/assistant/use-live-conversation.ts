'use client';

import type { UIMessage } from '@tuturuuu/ai/types';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef } from 'react';
import { useLiveAPIContext } from '@/hooks/use-live-api';
import type { GroundingMetadata } from './audio/multimodal-live-client';
import {
  type LiveConversationEvent,
  type LiveConversationMessage,
  reduceLiveConversation,
} from './live-conversation';
import { buildLiveConversationContext } from './live-conversation-context';
import type { ToolCall, ToolResponse } from './multimodal-live';

export type LiveConversationChange = (
  messages: LiveConversationMessage[],
  final: boolean
) => void;

export function useLiveConversation(
  onChange?: LiveConversationChange,
  history: UIMessage[] = []
) {
  const { client, connected } = useLiveAPIContext();
  const t = useTranslations('dashboard.voice_assistant');
  const translations = useRef(t);
  translations.current = t;
  const messages = useRef<LiveConversationMessage[]>([]);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const historyRef = useRef(history);
  const seeded = useRef(false);
  const publish = useCallback((event: LiveConversationEvent) => {
    if (!changeRef.current) return;
    messages.current = reduceLiveConversation(
      messages.current,
      event,
      crypto.randomUUID()
    );
    changeRef.current?.(
      messages.current,
      event.type === 'finish' ||
        event.type === 'result' ||
        event.type === 'source'
    );
  }, []);
  useEffect(() => {
    if (!changeRef.current || !connected || seeded.current) return;
    seeded.current = true;
    client.seedConversation(buildLiveConversationContext(historyRef.current));
  }, [client, connected]);
  useEffect(() => {
    const input = (text: string) =>
      publish({ type: 'text', role: 'user', text });
    const output = (text: string) =>
      publish({ type: 'text', role: 'assistant', text });
    const finish = () => publish({ type: 'finish' });
    const interrupted = () =>
      publish({
        type: 'finish',
        interrupted: true,
        errorText: translations.current('action_interrupted'),
      });
    const sources = (metadata: GroundingMetadata) => {
      for (const chunk of metadata.groundingChunks ?? []) {
        if (chunk.web?.uri)
          publish({
            type: 'source',
            url: chunk.web.uri,
            title: chunk.web.title,
          });
      }
    };
    const call = ({ functionCalls }: ToolCall) =>
      functionCalls.forEach((fc) => {
        publish({ type: 'tool', id: fc.id, name: fc.name, input: fc.args });
      });
    const result = ({ functionResponses }: ToolResponse) =>
      functionResponses.forEach((fr) => {
        publish({ type: 'result', id: fr.id, output: fr.response });
      });
    client
      .on('inputtranscription', input)
      .on('transcription', output)
      .on('turncomplete', finish)
      .on('interrupted', interrupted)
      .on('close', interrupted)
      .on('toolcall', call)
      .on('toolresponse', result)
      .on('groundingmetadata', sources);
    return () => {
      interrupted();
      client
        .off('inputtranscription', input)
        .off('transcription', output)
        .off('turncomplete', finish)
        .off('interrupted', interrupted)
        .off('close', interrupted)
        .off('toolcall', call)
        .off('toolresponse', result)
        .off('groundingmetadata', sources);
    };
  }, [client, publish]);
  return useCallback(
    (text: string) => {
      publish({ type: 'text', role: 'user', text });
      publish({ type: 'finish' });
    },
    [publish]
  );
}
