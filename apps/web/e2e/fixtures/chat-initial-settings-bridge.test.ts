import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';
import { afterAll, beforeEach, expect, test, vi } from 'vitest';
import { z } from 'zod';

// Missing real-SQL envelope is a failure in this explicit target, never a skip.
const inputPath = process.env.CHAT_INITIAL_SETTINGS_ENVELOPE;
const outputPath = process.env.CHAT_INITIAL_SETTINGS_WEB_RESULT;
if (!inputPath || !outputPath)
  throw new Error('Real SQL bridge envelope required');
const bytes = readFileSync(inputPath);
const jsonObject = z.record(z.string(), z.unknown());
const itemSchema = z.object({
  name: z.enum(['workspace', 'personal', 'null', 'legacy']),
  wsId: z.uuid(),
  actorId: z.uuid(),
  personalWsId: z.uuid(),
  input: jsonObject,
  receipt: jsonObject,
  readback: jsonObject,
});
const envelope = z
  .object({
    binding: jsonObject,
    sql: z.object({
      version: z.literal(1),
      committedReadback: z.literal(true),
      migrationVersion: z.literal('20261018020000'),
      createAllowed: z.literal(true),
      manageAllowed: z.literal(false),
      deniedSqlstate: z.literal('42501'),
      deniedCreatedRows: z.literal(0),
      cases: z.array(itemSchema).length(4),
    }),
  })
  .parse(JSON.parse(bytes.toString('utf8')));
const names = ['workspace', 'personal', 'null', 'legacy'];
expect(envelope.sql.cases.map((item) => item.name)).toEqual(names);
expect(envelope.binding.sourceSha).toBe(process.env.EMPLOYEE_SCHEMA_SOURCE_SHA);
expect(envelope.binding.controlSha).toBe(process.env.EMPLOYEE_SCHEMA_CONTROL_SHA);
expect(envelope.binding.runId).toBe(process.env.GITHUB_RUN_ID);
const envelopeSha256 = createHash('sha256').update(bytes).digest('hex');
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  context: vi.fn(),
  model: vi.fn(),
  personal: vi.fn(),
  publish: vi.fn(),
  actor: '',
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: NextRequest,
        auth: unknown,
        params: { wsId: string }
      ) => Promise<Response>
    ) =>
    (request: NextRequest, context: { params: Promise<{ wsId: string }> }) =>
      context.params.then((params) =>
        handler(request, { user: { id: mocks.actor }, supabase: {} }, params)
      ),
}));
vi.mock('@/lib/chat/private-rpc', async (original) => ({
  ...(await original<typeof import('@/lib/chat/private-rpc')>()),
  resolveChatRouteContext: (...args: unknown[]) => mocks.context(...args),
  callPrivateChatRpc: (...args: unknown[]) => mocks.rpc(...args),
}));
vi.mock('@tuturuuu/ai/credits/model-mapping', () => ({
  normalizeStableModelId: (id: string) => id,
}));
vi.mock('@tuturuuu/ai/credits/resolve-plan-model', () => ({
  resolvePlanModel: (...args: unknown[]) => mocks.model(...args),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => mocks.personal(),
      };
      return chain;
    },
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(),
  normalizeWorkspaceId: (id: string) => id,
}));
vi.mock('@/lib/ai-agents/external-chat-mirror', () => ({
  listAiAgentExternalThreadConversations: vi.fn(),
}));
vi.mock('@/lib/chat/agent-discovery', () => ({
  listAiChatConversations: vi.fn(),
  listRootAiAgentDiscoveryConversations: vi.fn(),
}));
vi.mock('@/lib/chat/realtime', () => ({
  getChatRealtimeAudience: () => ({}),
  publishChatRealtimeEvent: (...args: unknown[]) => mocks.publish(...args),
}));

const canonical = new Map<string, unknown>();
const passed = new Set<string>();
const first = envelope.sql.cases[0];
if (!first) throw new Error('SQL case missing');
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(
    new Error('Network forbidden in bridge')
  );
  mocks.actor = first.actorId;
  mocks.context.mockImplementation(async (input: unknown) => {
    expect(input).toMatchObject({ permission: 'view_chat', wsId: first.wsId });
    return {
      ok: true,
      context: {
        normalizedWsId: first.wsId,
        permissions: {
          withoutPermission: (permission: string) => permission === 'manage_chat',
        },
      },
    };
  });
  mocks.model.mockResolvedValue({ modelId: 'google/test', source: 'requested' });
  mocks.personal.mockResolvedValue({ data: { id: first.personalWsId }, error: null });
});
async function invoke(item: z.infer<typeof itemSchema>) {
  const { POST } = await import(
    '../../src/app/api/v1/workspaces/[wsId]/chat/conversations/route'
  );
  return POST(
    new NextRequest('https://synthetic.invalid/api', {
      method: 'POST',
      body: JSON.stringify(item.input),
    }),
    { params: Promise.resolve({ wsId: item.wsId }) }
  );
}
for (const item of envelope.sql.cases) {
  test(item.name, async () => {
    expect(item.receipt).toEqual(item.readback);
    mocks.rpc.mockImplementation(async (name: string, params: unknown) => {
      expect(name).toBe('chat_create_conversation');
      expect(params).toEqual({
        p_ws_id: item.wsId,
        p_actor_user_id: item.actorId,
        p_input: item.input,
      });
      // Synthetic SQL transport replays the actual committed payload unchanged.
      return item.receipt;
    });
    const response = await invoke(item);
    expect(response.status).toBe(201);
    const body = z
      .object({ conversation: jsonObject })
      .parse(await response.json());
    const rawTimestamp = z.string().parse(item.receipt.createdAt);
    expect(rawTimestamp).toMatch(/^\d{4}-\d{2}-\d{2} /);
    const expectedTimestamp =
      rawTimestamp
        .replace(' ', 'T')
        .replace(/\+00$/, '')
        .replace(/(?<=:\d{2})$/, '.000') + 'Z';
    expect(body.conversation.createdAt).toBe(expectedTimestamp);
    expect({ ...body.conversation, createdAt: rawTimestamp }).toEqual(item.receipt);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    if (item.name === 'legacy') expect(mocks.model).not.toHaveBeenCalled();
    else {
      expect(mocks.model).toHaveBeenCalledTimes(1);
      expect(mocks.model).toHaveBeenCalledWith({
        capability: 'language',
        requestedModel: 'google/test',
        wsId: item.name === 'personal' ? item.personalWsId : item.wsId,
      });
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mocks.publish).toHaveBeenCalledTimes(1);
    canonical.set(item.name, { ...item, response: body });
    passed.add(item.name);
  });
}
for (const name of [
  'invalid_calendar',
  'wrong_workspace',
  'wrong_tuple',
  'sql_denied',
  'route_denied',
]) {
  test(name, async () => {
    const receipt = structuredClone(first.receipt);
    if (name === 'invalid_calendar')
      receipt.createdAt = '2026-02-29 00:00:00.123456+00';
    if (name === 'wrong_workspace') receipt.wsId = first.personalWsId;
    if (name === 'wrong_tuple')
      receipt.initialAiSettings = {
        ...jsonObject.parse(receipt.initialAiSettings),
        thinkingMode: 'fast',
      };
    if (name === 'sql_denied')
      mocks.rpc.mockRejectedValue({
        code: '42501',
        message: 'chat_permission_required:create_chat',
      });
    else mocks.rpc.mockResolvedValue(receipt);
    if (name === 'route_denied')
      mocks.context.mockResolvedValue({
        ok: false,
        response: NextResponse.json({ message: 'denied' }, { status: 403 }),
      });
    const response = await invoke(first);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.rpc).toHaveBeenCalledTimes(name === 'route_denied' ? 0 : 1);
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    passed.add(name);
  });
}
afterAll(() => {
  const expected = [
    ...names,
    'invalid_calendar',
    'wrong_workspace',
    'wrong_tuple',
    'sql_denied',
    'route_denied',
  ];
  expect([...passed]).toEqual(expected);
  writeFileSync(
    outputPath,
    JSON.stringify({
      binding: envelope.binding,
      envelopeSha256,
      passed: expected,
      providerCalls: 0,
      cases: names.map((name) => canonical.get(name)),
    }),
    { mode: 0o600 }
  );
});
