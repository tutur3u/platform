import { timingSafeEqual } from 'node:crypto';
import {
  authorizeMemoryRequest,
  PEOPLE_MEMORY_CALLER,
} from '@tuturuuu/ai/memory/people-namespace';
import {
  type Caller,
  type Command,
  isJsonRecord,
  MAX_BODY_BYTES,
  operations,
  type Store,
} from './protocol';

export type CallerSecrets = {
  MEMORY_ASSISTANT_CALLER_SECRET?: string;
  MEMORY_PEOPLE_CALLER_SECRET?: string;
};

class RequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(code);
  }
}

const headers = { 'Cache-Control': 'no-store' };

async function authenticate(
  request: Request,
  secrets: CallerSecrets
): Promise<Caller | null> {
  const token = /^Bearer ([^\s]{1,512})$/i.exec(
    request.headers.get('Authorization') ?? ''
  )?.[1];
  if (!token) return null;

  const digest = (value: string) =>
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [presented, assistant, people] = await Promise.all([
    digest(token),
    digest(secrets.MEMORY_ASSISTANT_CALLER_SECRET ?? ''),
    digest(secrets.MEMORY_PEOPLE_CALLER_SECRET ?? ''),
  ]);
  const isAssistant =
    timingSafeEqual(presented, assistant) &&
    !!secrets.MEMORY_ASSISTANT_CALLER_SECRET;
  const isPeople =
    timingSafeEqual(presented, people) && !!secrets.MEMORY_PEOPLE_CALLER_SECRET;
  if (isAssistant === isPeople) return null;
  return isPeople ? PEOPLE_MEMORY_CALLER : 'assistant';
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES)
    throw new RequestError(413, 'body_too_large');
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, 'invalid_body');
  const bytes = new Uint8Array(MAX_BODY_BYTES);
  let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (length + chunk.value.byteLength > bytes.length) {
        await reader.cancel();
        throw new RequestError(413, 'body_too_large');
      }
      bytes.set(chunk.value, length);
      length += chunk.value.byteLength;
    }
    const body: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        bytes.subarray(0, length)
      )
    );
    if (isJsonRecord(body)) return body;
  } catch (error) {
    if (error instanceof RequestError) throw error;
  } finally {
    reader.releaseLock();
  }
  throw new RequestError(400, 'invalid_body');
}

function getTags(
  body: Record<string, unknown>,
  operation: Command['operation']
) {
  const tags: unknown =
    operation === 'list' ? body.containerTags : [body.containerTag];
  if (
    !Array.isArray(tags) ||
    tags.length > 20 ||
    !tags.every(
      (value): value is string =>
        typeof value === 'string' && value.length > 0 && value.length <= 160
    )
  )
    throw new RequestError(400, 'invalid_tags');
  return tags;
}

function authorize(
  caller: Caller,
  operation: Command['operation'],
  body: Record<string, unknown>
) {
  const containerTags = getTags(body, operation);
  const customId = body.customId;
  if (customId !== undefined && typeof customId !== 'string')
    throw new RequestError(400, 'invalid_custom_id');
  const scope = authorizeMemoryRequest(
    { id: caller },
    { operation, containerTags, customId }
  );
  if (!scope.ok) throw new RequestError(403, scope.reason);
  if (containerTags.some((tag) => tag !== tag.trim()))
    throw new RequestError(403, 'invalid_tag');
  if (
    caller === 'assistant' &&
    containerTags.some(
      (tag) =>
        !/^tuturuuu\.user\.[a-zA-Z0-9._-]+\.workspace\.[a-zA-Z0-9._-]+$/.test(
          tag
        )
    )
  )
    throw new RequestError(403, 'scope_denied');
}

export async function handleMemoryRequest(
  request: Request,
  secrets: CallerSecrets,
  store: Store
) {
  try {
    const caller = await authenticate(request, secrets);
    if (!caller) throw new RequestError(401, 'unauthorized');
    if (request.method !== 'POST')
      throw new RequestError(405, 'method_not_allowed');

    const path = new URL(request.url).pathname;
    if (!Object.hasOwn(operations, path))
      throw new RequestError(404, 'not_found');
    const { operation, schema } = operations[path as keyof typeof operations];
    const input = await readJson(request);
    authorize(caller, operation, input);
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new RequestError(400, 'invalid_body');
    // A route entry pairs exactly one operation with its body schema.
    const command = { operation, body: parsed.data } as Command;
    if (
      (command.operation === 'read' || command.operation === 'update') &&
      caller === 'assistant' &&
      (!command.body.userId || !command.body.wsId || !command.body.product)
    )
      throw new RequestError(400, 'invalid_scope');
    if (command.operation === 'purge' || command.operation === 'forget') {
      const { body } = command;
      if (
        caller === PEOPLE_MEMORY_CALLER &&
        'customIdPrefix' in body &&
        body.customIdPrefix
      )
        throw new RequestError(403, 'custom_id_mismatch');
      const customIds = 'customIds' in body ? (body.customIds ?? []) : [];
      for (const customId of [
        ...customIds,
        ...(body.replacement ? [body.replacement.customId] : []),
      ]) {
        authorize(caller, operation, {
          containerTag: body.containerTag,
          customId,
        });
      }
    }
    const result = await store(caller, command);
    return Response.json(result.body, {
      status: result.status ?? 200,
      headers,
    });
  } catch (error) {
    if (error instanceof RequestError)
      return Response.json(
        { error: error.code },
        { status: error.status, headers }
      );
    console.error('Memory Worker request failed');
    return Response.json(
      { error: 'memory_unavailable' },
      { status: 503, headers }
    );
  }
}
