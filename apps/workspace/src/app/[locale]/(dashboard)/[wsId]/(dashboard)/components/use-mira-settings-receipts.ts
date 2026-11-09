'use client';

import type { QueryClient } from '@tanstack/react-query';
import type { UIMessage } from '@tuturuuu/ai/types';
import { useEffect, useRef } from 'react';
import {
  type MiraSoulLease,
  miraSoulKeys,
  useMiraSoulScope,
} from '@/components/mira-soul-scope';
import { getMiraToolName } from './mira-tool-part-utils';

type Operation = {
  scope: MiraSoulLease;
  epoch: number;
  wsId: string;
  chatId?: string;
  existing: Set<string>;
  handled: Set<string>;
};

// Track only committed transitions. Restored messages are baseline, never a
// source of new UI commands, including when the next submitted turn begins.
export function useMiraSettingsReceipts({
  messages,
  status,
  wsId,
  chatId,
  queryClient,
}: {
  messages: UIMessage[];
  status: string;
  wsId: string;
  chatId?: string;
  queryClient: QueryClient;
}) {
  const scope = useMiraSoulScope();
  const previous = useRef<{
    busy: boolean;
    scope: MiraSoulLease | null;
    wsId: string;
    chatId?: string;
    ids: Set<string>;
  } | null>(null);
  const operation = useRef<Operation | null>(null);
  useEffect(() => {
    const busy = status === 'submitted' || status === 'streaming';
    const before = previous.current;
    const same =
      before?.scope === scope &&
      before?.wsId === wsId &&
      before?.chatId === chatId;
    if (!same) operation.current = null;
    if (same && !before.busy && busy && scope?.active) {
      operation.current = {
        scope,
        epoch: scope.epoch,
        wsId,
        chatId,
        existing: before.ids,
        handled: new Set(),
      };
    }
    previous.current = {
      busy,
      scope,
      wsId,
      chatId,
      ids: new Set(messages.map((message) => message.id)),
    };
    const current = operation.current;
    if (
      !current ||
      !scope?.active ||
      current.scope !== scope ||
      current.epoch !== scope.epoch ||
      current.wsId !== wsId ||
      current.chatId !== chatId
    )
      return;
    if (!busy && !before?.busy) return;
    for (const message of messages) {
      if (message.role !== 'assistant' || current.existing.has(message.id))
        continue;
      for (const part of message.parts ?? []) {
        if (getMiraToolName(part) !== 'update_my_settings') continue;
        const value = part as unknown as {
          state?: string;
          toolCallId?: string;
          input?: unknown;
          preliminary?: boolean;
          output?: {
            success?: unknown;
            error?: unknown;
            preliminary?: boolean;
          };
          toolInvocation?: {
            state?: string;
            toolCallId?: string;
            args?: unknown;
          };
        };
        const callId = value.toolInvocation?.toolCallId ?? value.toolCallId;
        if (typeof callId !== 'string' || !callId.trim()) continue;
        const input = value.toolInvocation?.args ?? value.input;
        if (!input || typeof input !== 'object' || Array.isArray(input))
          continue;
        const output = value.output;
        if (
          (value.toolInvocation?.state ?? value.state) !== 'output-available' ||
          value.preliminary === true ||
          output?.preliminary === true ||
          output?.success !== true ||
          output.error != null
        )
          continue;
        const key = `${message.id}:${callId}`;
        if (current.handled.has(key)) continue;
        current.handled.add(key);
        const intent = ++scope.intent;
        const queryKey = miraSoulKeys.detail(scope.actorId);
        void queryClient.cancelQueries({ queryKey, exact: true }).then(() => {
          if (
            operation.current !== current ||
            !scope.active ||
            scope.epoch !== current.epoch ||
            scope.intent !== intent
          )
            return;
          return queryClient.invalidateQueries({ queryKey, exact: true });
        });
      }
    }
  }, [chatId, messages, queryClient, scope, status, wsId]);
}
