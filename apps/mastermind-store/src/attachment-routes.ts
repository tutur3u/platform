/**
 * Reply attachment routes of the Mastermind store Worker.
 *
 * Service token (Web only):
 * - `POST /v1/bridge/attachments/reserve`: mint one upload record.
 * - `PUT  /v1/bridge/attachments/object?id=`: finalize it once with the
 *   derived bytes; the fields ride the `x-mm-attachment` header.
 * - `POST /v1/bridge/attachments/records`: read records by id.
 * - `POST /v1/bridge/send2`: store and push a reply with attachments.
 *
 * Machine capability (no service token):
 * - `GET  /v1/bridge/attachments/fetch?id=` with `Authorization: MM-Fetch
 *   <capability>`: one bound object's bytes, while its reply waits for the
 *   machine. Every refusal is the same bare 404, and nothing is redirected.
 */
import {
  ATTACHMENT_FETCH_SCHEME,
  ATTACHMENT_FINALIZE_HEADER,
  ATTACHMENT_LIMITS,
  attachmentFinalizeSchema,
  attachmentIdSchema,
  attachmentRecordsRequestSchema,
  attachmentReserveSchema,
  bridgeSendV2Schema,
} from '@tuturuuu/utils/mastermind-store/reply-attachments';
import type { BridgeErrorCode } from '@tuturuuu/utils/mastermind-store/bridge-protocol';
import { json, readCapped, readCappedBytes } from './http';
import type { StoreEnv } from './worker';

type Result = { response: Response; kind: string };
const CAPABILITY = /^[0-9a-f]{64}$/u;
const MAX_JSON = 64 * 1024;

const stub = (env: StoreEnv) =>
  env.MASTERMIND_BRIDGE.get(env.MASTERMIND_BRIDGE.idFromName('v1'));

async function parseJson(request: Request) {
  const body = await readCapped(request, MAX_JSON);
  if (body === null) return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}

/** The machine's fetch; answered before any service-token check. */
export async function handleAttachmentFetch(
  request: Request,
  env: StoreEnv,
  budget: number | null
): Promise<Result> {
  const missing = { response: new Response(null, { status: 404 }), kind: '' };
  const id = new URL(request.url).searchParams.get('id') ?? '';
  const header = request.headers.get('authorization') ?? '';
  const capability = header.startsWith(`${ATTACHMENT_FETCH_SCHEME} `)
    ? header.slice(ATTACHMENT_FETCH_SCHEME.length + 1)
    : '';
  if (
    budget === null ||
    !attachmentIdSchema.safeParse(id).success ||
    !CAPABILITY.test(capability)
  )
    return { ...missing, kind: 'bridge:fetch:refused' };
  const bytes = await stub(env).fetchAttachment(id, capability, budget);
  if (!bytes) return { ...missing, kind: 'bridge:fetch:refused' };
  return {
    response: new Response(bytes, {
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(bytes.byteLength),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
      },
    }),
    kind: 'bridge:fetch',
  };
}

/** The service-token attachment routes; null when the path is not one. */
export async function handleAttachmentRoutes(
  request: Request,
  env: StoreEnv,
  path: string,
  budget: number,
  fail: (error: BridgeErrorCode) => Response
): Promise<Result | null> {
  if (path === '/v1/bridge/send2' && request.method === 'POST') {
    const parsed = bridgeSendV2Schema.safeParse(await parseJson(request));
    if (!parsed.success)
      return { response: fail('bad_request'), kind: 'bridge:send2:schema' };
    const sent = await stub(env).sendV2(parsed.data, budget);
    return sent.ok
      ? { response: json(sent), kind: `bridge:send2:${sent.receipt.state}` }
      : { response: fail(sent.error), kind: `bridge:send2:${sent.error}` };
  }

  if (path === '/v1/bridge/attachments/reserve' && request.method === 'POST') {
    const parsed = attachmentReserveSchema.safeParse(await parseJson(request));
    if (!parsed.success)
      return { response: fail('bad_request'), kind: 'bridge:reserve:schema' };
    const reserved = await stub(env).reserveAttachment(parsed.data, budget);
    return reserved.ok
      ? { response: json(reserved), kind: 'bridge:reserve' }
      : {
          response: fail(reserved.error),
          kind: `bridge:reserve:${reserved.error}`,
        };
  }

  if (path === '/v1/bridge/attachments/object' && request.method === 'PUT') {
    const id = new URL(request.url).searchParams.get('id') ?? '';
    let fields: unknown;
    try {
      fields = JSON.parse(
        request.headers.get(ATTACHMENT_FINALIZE_HEADER) ?? ''
      ) as unknown;
    } catch {
      fields = undefined;
    }
    const parsed = attachmentFinalizeSchema.safeParse(fields);
    if (!attachmentIdSchema.safeParse(id).success || !parsed.success)
      return { response: fail('bad_request'), kind: 'bridge:object:schema' };
    const bytes = await readCappedBytes(
      request,
      ATTACHMENT_LIMITS.maxFileBytes
    );
    if (bytes === null || bytes.byteLength === 0)
      return { response: fail('bad_request'), kind: 'bridge:object:size' };
    const done = await stub(env).finalizeAttachment(
      id,
      parsed.data,
      bytes.buffer as ArrayBuffer,
      budget
    );
    return done.ok
      ? { response: json(done), kind: 'bridge:object' }
      : { response: fail(done.error), kind: `bridge:object:${done.error}` };
  }

  if (path === '/v1/bridge/attachments/records' && request.method === 'POST') {
    const parsed = attachmentRecordsRequestSchema.safeParse(
      await parseJson(request)
    );
    if (!parsed.success)
      return { response: fail('bad_request'), kind: 'bridge:records:schema' };
    return {
      response: json({
        ok: true,
        records: await stub(env).attachmentRecords(parsed.data.ids),
      }),
      kind: 'bridge:records',
    };
  }

  return null;
}
