// @vitest-environment node
import { createMiraSdkToolSearch } from '@tuturuuu/ai/tools/mira-sdk-tool-search';
import { stepCountIs, streamText, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  assistantMessage,
  conversation,
  createAdminClientMock,
  mocks,
  resetMessageRouteMocks,
  userMessage,
} from './route.test.harness';

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

beforeEach(resetMessageRouteMocks);
afterEach(() => vi.useRealTimers());

// Run unchanged against the baseline and candidate source. This measures the
// actual native POST -> SSE adapter -> first NDJSON text delta, with deterministic
// IO/model latency. Authentication, database and provider networks are fixtures.
for (const prompt of ['thanks', "today's focus"]) {
  it(`reports first-text latency and model work for ${prompt}`, async () => {
    const { POST } = await import('./route');
    const results: Array<{
      firstTextMs: number;
      stepsBeforeText: number;
      modelSteps: number;
    }> = [];
    for (let run = 0; run < 5; run++) {
      resetMessageRouteMocks();
      vi.useFakeTimers();
      vi.setSystemTime(0);
      let modelSteps = 0;
      let stepsBeforeText = 0;
      let taskReads = 0;
      let assistantWrites = 0;
      const user = { ...userMessage, content: prompt };
      const admin = createAdminClientMock();
      admin
        .schema()
        .from()
        .maybeSingle.mockImplementation(async () => {
          await wait(80);
          return { data: null, error: null };
        });
      const table = admin.from();
      admin.from.mockReturnValue(table);
      const upsert = table.upsert;
      upsert.mockImplementation(async () => {
        await wait(20);
        return { error: null };
      });
      mocks.createAdminClient.mockResolvedValue(admin);
      mocks.callPrivateChatRpc.mockImplementation(async (name: string) => {
        switch (name) {
          case 'chat_send_user_message_idempotent':
            return { message: user, replayed: false };
          case 'chat_get_conversation':
            return conversation;
          case 'chat_list_messages':
            await wait(120);
            return [user];
          case 'chat_persist_ai_message_batch_idempotent':
            assistantWrites++;
            return { messages: [assistantMessage], replayed: false };
          default:
            throw new Error(`Unexpected RPC ${name}`);
        }
      });
      const provider = new MockLanguageModelV4({
        doStream: async (options) => {
          modelSteps++;
          await wait(200);
          const needsTasks = prompt !== 'thanks' && taskReads === 0;
          const toolName = options.tools?.some(
            (entry) => entry.name === 'get_my_tasks'
          )
            ? 'get_my_tasks'
            : 'search_tools';
          if (needsTasks) stepsBeforeText++;
          return {
            stream: new ReadableStream({
              start(controller) {
                controller.enqueue({ type: 'stream-start', warnings: [] });
                if (needsTasks) {
                  controller.enqueue({
                    type: 'tool-call',
                    toolCallId: `call-${modelSteps}`,
                    toolName,
                    input:
                      toolName === 'search_tools'
                        ? '{"query":"get_my_tasks"}'
                        : '{}',
                  });
                } else {
                  controller.enqueue({ type: 'text-start', id: 'text' });
                  controller.enqueue({
                    type: 'text-delta',
                    id: 'text',
                    delta:
                      prompt === 'thanks'
                        ? 'You are welcome.'
                        : 'Focus on the saved task.',
                  });
                  controller.enqueue({ type: 'text-end', id: 'text' });
                }
                controller.enqueue({
                  type: 'finish',
                  usage,
                  finishReason: {
                    unified: needsTasks ? 'tool-calls' : 'stop',
                    raw: undefined,
                  },
                });
                controller.close();
              },
            }),
          };
        },
      });
      mocks.createAiChatPost.mockReturnValue(async (request: Request) => {
        mocks.aiRouteBodies.push(await request.json());
        const runtime = createMiraSdkToolSearch(
          {
            search_tools: tool({
              inputSchema: z.object({ query: z.string() }),
            }),
            select_tools: tool({
              inputSchema: z.object({ tools: z.array(z.string()) }),
            }),
            get_my_tasks: tool({
              description: 'Read my tasks for today',
              inputSchema: z.object({}),
              execute: async () => {
                taskReads++;
                return [{ title: 'Saved task' }];
              },
            }),
          },
          { userId: 'user-1', wsId: 'workspace-1', supabase: {} } as never
        );
        return streamText({
          model: provider,
          prompt,
          tools: runtime.tools,
          prepareStep: () =>
            runtime.prepareStep({
              activeTools: ['search_tools', 'select_tools'],
            }),
          stopWhen: stepCountIs(5),
        }).toUIMessageStreamResponse();
      });
      const started = Date.now();
      const completed = (async () => {
        const response = await POST(
          new Request('http://localhost/api/chat/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              accept: 'application/x-ndjson',
            },
            body: JSON.stringify({
              content: prompt,
              clientRequestId: '11111111-1111-4111-8111-111111111111',
            }),
          }) as never,
          {
            params: Promise.resolve({
              wsId: conversation.wsId,
              conversationId: conversation.id,
            }),
          }
        );
        expect(response.status).toBe(201);
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let firstTextMs: number | undefined;
        let done = false;
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          buffer += decoder.decode(chunk.value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines.filter(Boolean)) {
            const event = JSON.parse(line);
            expect(event.type).not.toBe('error');
            if (event.type === 'assistant_delta' && firstTextMs === undefined)
              firstTextMs = Date.now() - started;
            if (event.type === 'done') done = true;
          }
        }
        expect(done).toBe(true);
        expect(firstTextMs).toBeDefined();
        expect(assistantWrites).toBe(1);
        expect(taskReads).toBe(prompt === 'thanks' ? 0 : 1);
        results.push({
          firstTextMs: firstTextMs!,
          stepsBeforeText,
          modelSteps,
        });
      })();
      await vi.runAllTimersAsync();
      await completed;
      vi.useRealTimers();
    }
    console.info(
      'Mira synthetic TTFT',
      JSON.stringify({ prompt, runs: results })
    );
    expect(results).toHaveLength(5);
  });
}
