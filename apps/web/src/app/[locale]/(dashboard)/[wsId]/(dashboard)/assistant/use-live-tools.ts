'use client';

import { useMutation } from '@tanstack/react-query';
import { executeLiveTool } from '@tuturuuu/internal-api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { useLiveAPIContext } from '@/hooks/use-live-api';
import {
  executeWorkspaceLiveTool,
  LIVE_MUTATION_TOOLS,
} from './live-workspace-tools';
import type { ToolCall } from './multimodal-live';
import { useVisualizationStore } from './stores/visualization-store';
import type {
  CoreMentionVisualization,
  VisualizationToolResponse,
} from './types/visualizations';

export interface LiveToolActivity {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'approval' | 'running' | 'complete' | 'failed' | 'cancelled';
}
export interface LiveSessionNote {
  id: string;
  title: string;
  content: string;
}

export function useLiveTools(wsId: string) {
  const { client, connected, sendToolResponse } = useLiveAPIContext();
  const [activities, setActivities] = useState<LiveToolActivity[]>([]);
  const [calendarResult, setCalendarResult] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [notes, setNotes] = useState<LiveSessionNote[]>([]);
  const pending = useRef(
    new Map<
      string,
      { controller: AbortController; approve?: (value: boolean) => void }
    >()
  );
  const seen = useRef(new Set<string>());
  const active = useRef(true);
  const {
    addVisualization,
    setCenterVisualization,
    dismissVisualization,
    dismissCenterVisualization,
    dismissAllVisualizations,
    clearAllVisualizations,
  } = useVisualizationStore();
  const update = useCallback(
    (id: string, status: LiveToolActivity['status']) => {
      if (active.current)
        setActivities((items) =>
          items.map((item) => (item.id === id ? { ...item, status } : item))
        );
    },
    []
  );
  const decide = useCallback(
    (id: string, allowed: boolean) =>
      pending.current.get(id)?.approve?.(allowed),
    []
  );
  const { mutateAsync: executeFunction } = useMutation({
    retry: false,
    mutationFn: async ({
      fc,
      signal,
    }: {
      fc: ToolCall['functionCalls'][number];
      signal: AbortSignal;
    }) => {
      signal.throwIfAborted();
      if (fc.name === 'capture_session_note') {
        const note = z
          .object({
            title: z.string().trim().min(1).max(200),
            content: z.string().trim().min(1).max(5000),
          })
          .parse(fc.args);
        if (!signal.aborted && active.current)
          setNotes((items) => [
            ...items.slice(-49),
            { ...note, id: crypto.randomUUID() },
          ]);
        return {
          id: fc.id,
          name: fc.name,
          response: { success: true, storage: 'current session only', ...note },
        };
      }
      // Handle highlight_core_topic tool locally (no API call needed)
      if (fc.name === 'highlight_core_topic') {
        const args = z
          .object({
            title: z.string().max(200),
            content: z.string().max(5000),
            emphasis: z
              .enum(['info', 'warning', 'success', 'highlight'])
              .optional(),
          })
          .parse(fc.args);

        // Set center visualization (replaces previous)
        const visData: Omit<
          CoreMentionVisualization,
          'id' | 'createdAt' | 'dismissed' | 'side'
        > = {
          type: 'core_mention',
          data: {
            title: args.title,
            content: args.content,
            emphasis: args.emphasis || 'highlight',
          },
        };
        setCenterVisualization(visData);
        console.log('[Assistant] Set core mention visualization');

        return {
          id: fc.id,
          name: fc.name,
          response: {
            success: true,
            message: 'Core topic highlighted on screen',
          },
        };
      }

      // Handle dismiss_core_mention tool locally
      if (fc.name === 'dismiss_core_mention') {
        dismissCenterVisualization();
        console.log('[Assistant] Dismissed core mention visualization');

        return {
          id: fc.id,
          name: fc.name,
          response: { success: true, message: 'Core mention dismissed' },
        };
      }

      // Execute other tools via API
      const result =
        (await executeWorkspaceLiveTool(fc.name, fc.args, wsId, signal)) ??
        (
          await executeLiveTool(
            { wsId, functionName: fc.name, args: fc.args },
            { signal }
          )
        ).result;
      signal.throwIfAborted();
      if (fc.name === 'get_calendar_events') setCalendarResult(result);
      if (fc.name === 'create_calendar_event')
        setCalendarResult({ events: [result.event], count: 1 });
      // Handle visualization actions from backend
      const visResult =
        typeof result.action === 'string'
          ? (result as unknown as VisualizationToolResponse)
          : undefined;
      if (visResult?.action) {
        if (visResult.action === 'dismiss_visualization') {
          if (visResult.visualizationId === 'all') {
            dismissAllVisualizations();
          } else if (visResult.visualizationId) {
            dismissVisualization(visResult.visualizationId);
          }
        } else if (visResult.visualization) {
          // Add visualization to the store
          const visId = addVisualization(visResult.visualization);
          console.log(`[Assistant] Added visualization: ${visId}`);
        }
      }

      // Format response according to Google GenAI SDK requirements
      // Must include id, name, and response object
      // See: https://ai.google.dev/gemini-api/docs/live-tools
      // The response should contain the data directly, not nested
      return {
        id: fc.id,
        name: fc.name,
        response: result,
      };
    },
  });
  useEffect(() => {
    active.current = true;
    clearAllVisualizations();
    return () => {
      active.current = false;
      pending.current.forEach((item) => {
        item.controller.abort();
        item.approve?.(false);
      });
      pending.current.clear();
      clearAllVisualizations();
    };
  }, [clearAllVisualizations]);
  useEffect(() => {
    const cancel = ({ ids }: { ids: string[] }) => {
      ids.forEach((id) => {
        const item = pending.current.get(id);
        item?.controller.abort();
        item?.approve?.(false);
        update(id, 'cancelled');
      });
    };
    const close = () => cancel({ ids: [...pending.current.keys()] });
    const handle = async (call: ToolCall) => {
      // Register the entire batch first so cancellation includes queued calls.
      const calls = call.functionCalls.filter((fc) => {
        if (!fc.id || seen.current.has(fc.id) || !active.current) return false;
        seen.current.add(fc.id);
        pending.current.set(fc.id, { controller: new AbortController() });
        return true;
      });
      for (const fc of calls) {
        const item = pending.current.get(fc.id);
        if (!item || item.controller.signal.aborted || !active.current) {
          pending.current.delete(fc.id);
          continue;
        }
        const { controller } = item;
        const needsApproval = LIVE_MUTATION_TOOLS.has(fc.name);
        setActivities((items) => [
          ...items.slice(-99),
          {
            id: fc.id,
            name: fc.name,
            args: fc.args,
            status: needsApproval ? 'approval' : 'running',
          },
        ]);
        try {
          const approved =
            !needsApproval ||
            (await new Promise<boolean>((resolve) => {
              item.approve = resolve;
            }));
          if (controller.signal.aborted || !active.current) continue;
          if (!approved) {
            update(fc.id, 'cancelled');
            if (client.ws)
              sendToolResponse({
                functionResponses: [
                  {
                    id: fc.id,
                    name: fc.name,
                    response: {
                      cancelled: true,
                      message: 'User declined this action. Do not retry.',
                    },
                  },
                ],
              });
            continue;
          }
          update(fc.id, 'running');
          const result = await executeFunction({
            fc,
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(15000),
            ]),
          });
          if (controller.signal.aborted || !active.current) continue;
          update(
            fc.id,
            'error' in result.response ||
              ('success' in result.response &&
                result.response.success === false)
              ? 'failed'
              : 'complete'
          );
          if (client.ws) sendToolResponse({ functionResponses: [result] });
        } catch {
          if (!controller.signal.aborted && active.current) {
            update(fc.id, 'failed');
            if (client.ws)
              sendToolResponse({
                functionResponses: [
                  {
                    id: fc.id,
                    name: fc.name,
                    response: {
                      error:
                        'Tool failed. Do not claim success or retry a mutation automatically; ask the user to check its result.',
                    },
                  },
                ],
              });
          }
        } finally {
          pending.current.delete(fc.id);
        }
      }
    };
    client
      .on('toolcall', handle)
      .on('toolcallcancellation', cancel)
      .on('close', close);
    return () => {
      client
        .off('toolcall', handle)
        .off('toolcallcancellation', cancel)
        .off('close', close);
    };
  }, [client, executeFunction, sendToolResponse, update]);
  useEffect(() => {
    if (!connected)
      pending.current.forEach((item, id) => {
        item.controller.abort();
        item.approve?.(false);
        update(id, 'cancelled');
      });
  }, [connected, update]);
  return { activities, notes, decide, calendarResult };
}
