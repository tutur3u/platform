import { createHash } from 'node:crypto';
import {
  type CollaborationTicket,
  programmingDocumentSnapshot,
  replaceProgrammingText,
  Y,
} from '@tuturuuu/realtime/collaboration/server';
import {
  type ProgrammingCodeCommand,
  programmingCodeCommandSchema,
  type ProgrammingMiraContext,
} from '@tuturuuu/realtime/meet';
import { PlaygroundFiles } from '../../../packages/utils/src/playground-schema';

const MAX_MIRA_COMMAND_BYTES = 110_000;

async function readMiraFixCommand(
  request: Request
): Promise<ProgrammingCodeCommand | Response> {
  if (request.method !== 'POST' || !request.body)
    return new Response(null, { status: 400 });
  if (Number(request.headers.get('content-length')) > MAX_MIRA_COMMAND_BYTES)
    return new Response(null, { status: 413 });
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let total = 0;
  let raw = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_MIRA_COMMAND_BYTES) {
        void reader.cancel().catch(() => undefined);
        return new Response(null, { status: 413 });
      }
      raw += decoder.decode(value, { stream: true });
    }
    return programmingCodeCommandSchema.parse(
      JSON.parse(raw + decoder.decode())
    );
  } catch {
    void reader.cancel().catch(() => undefined);
    return new Response(null, { status: 400 });
  } finally {
    reader.releaseLock();
  }
}

export function miraCodeExcerpt(
  doc: Y.Doc,
  range: ProgrammingCodeCommand['range']
) {
  const current = doc.getMap<Y.Text>('files').get(range.filePath);
  if (!(current instanceof Y.Text)) return null;
  const content = current.toString();
  const lines = content.split('\n');
  if (range.endLine > lines.length) return null;
  const original = lines.slice(range.startLine - 1, range.endLine).join('\n');
  if (original.length > 8000) return null;
  return {
    ...range,
    original,
    digest: createHash('sha256').update(content).digest('hex'),
  } satisfies ProgrammingMiraContext;
}

export function buildMiraFixUpdate(
  doc: Y.Doc,
  command: Extract<ProgrammingCodeCommand, { action: 'resolve' }>
) {
  const excerpt = miraCodeExcerpt(doc, command.range);
  if (
    excerpt?.digest !== command.digest ||
    excerpt.original !== command.original
  )
    return null;
  const candidate = new Y.Doc();
  try {
    Y.applyUpdate(candidate, Y.encodeStateAsUpdate(doc));
    const text = candidate.getMap<Y.Text>('files').get(excerpt.filePath)!;
    const lines = text.toString().split('\n');
    lines.splice(
      excerpt.startLine - 1,
      excerpt.endLine - excerpt.startLine + 1,
      ...(command.replacement === '' ? [] : [command.replacement])
    );
    replaceProgrammingText(text, lines.join('\n'));
    if (
      !PlaygroundFiles.safeParse(programmingDocumentSnapshot(candidate).files)
        .success
    )
      return null;
    const full = Y.encodeStateAsUpdate(candidate);
    if (full.byteLength > 3_000_000) return null;
    return {
      full,
      update: Y.encodeStateAsUpdate(candidate, Y.encodeStateVector(doc)),
    };
  } finally {
    candidate.destroy();
  }
}

const RECEIPTS_KEY = 'mira-fix-receipts';
type Receipt = { decision: 'accepted' | 'dismissed' | 'stale'; at: number };

export async function handleProgrammingMiraFix({
  request,
  ticket,
  state,
  doc,
  documentKey,
  publish,
}: {
  request: Request;
  ticket: CollaborationTicket;
  state: DurableObjectState;
  doc: Y.Doc;
  documentKey: string;
  publish: (update: Uint8Array) => Promise<void>;
}) {
  if (ticket.role !== 'owner') return new Response(null, { status: 403 });
  const command = await readMiraFixCommand(request);
  if (command instanceof Response) return command;
  if (command.action === 'read') {
    if (ticket.exp * 1000 <= Date.now())
      return new Response(null, { status: 403 });
    const excerpt = miraCodeExcerpt(doc, command.range);
    return excerpt
      ? Response.json(excerpt)
      : new Response(null, { status: 409 });
  }
  return state.blockConcurrencyWhile(async () => {
    if (ticket.exp * 1000 <= Date.now())
      return new Response(null, { status: 403 });
    const receipts =
      (await state.storage.get<Record<string, Receipt>>(RECEIPTS_KEY)) ?? {};
    const receipt = receipts[command.id];
    if (receipt && receipt.decision !== 'stale')
      return receipt.decision === command.decision
        ? Response.json({ ok: true })
        : new Response(null, { status: 409 });
    if (receipt?.decision === 'stale' && command.decision === 'accepted')
      return new Response(null, { status: 409 });

    const now = Date.now();
    for (const [id, record] of Object.entries(receipts)) {
      if (now - record.at > 86_400_000) delete receipts[id];
    }
    if (!receipt && Object.keys(receipts).length >= 128)
      return new Response(null, { status: 429 });
    const candidate =
      command.decision === 'accepted' ? buildMiraFixUpdate(doc, command) : null;
    const stale = command.decision === 'accepted' && !candidate;
    receipts[command.id] = {
      decision: stale ? 'stale' : command.decision,
      at: now,
    };
    await state.storage.put({
      [RECEIPTS_KEY]: receipts,
      ...(candidate ? { [documentKey]: candidate.full } : {}),
    });
    if (stale) return new Response(null, { status: 409 });
    if (candidate) {
      Y.applyUpdate(doc, candidate.update);
      await publish(candidate.update);
    }
    return Response.json({ ok: true });
  });
}
