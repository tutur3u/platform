/**
 * React server actions (`'use server'` modules) for RSC mode. TanStack Start
 * disables plugin-rsc's action handler, so the bridge routes React's
 * `callServer` through a Start server function, and the Start CSRF
 * middleware applies. Arguments travel in React's own reply encoding
 * (`encodeReply`/`decodeReply`), so `FormData`, files and bound arguments of
 * form actions arrive as React sends them.
 *
 * The bridge's function proxy accepts JSON POSTs only (a JSON content type
 * forces a CORS preflight, which keeps cross-site forms out), so a form reply
 * travels as JSON entries with files base64-encoded. Large uploads belong in
 * storage uploads, not action arguments.
 */
export interface EncodedFile {
  name: string;
  type: string;
  base64: string;
}

export type ServerActionCall =
  | { id: string; reply: string }
  | { id: string; form: [string, string | EncodedFile][] };

/** The action's return value, boxed so `undefined` survives the transport. */
export interface ServerActionResult {
  value: unknown;
}

/** Bounds applied to the whole call before anything is decoded. */
export const MAX_ACTION_BYTES = 10 * 1024 * 1024;
export const MAX_ACTION_ENTRIES = 1000;

const SERVER_REFERENCE = Symbol.for('react.server.reference');
// `<module key>#<export name>`; the export name is a JS identifier.
const ACTION_ID = /^[^#\s]{1,256}#[A-Za-z_$][\w$]{0,255}$/u;

class ActionTooLargeError extends Error {
  constructor() {
    super('Server action arguments are too large');
  }
}

/** UTF-8 bytes of `value`, counting up to the remaining budget. */
function utf8Bytes(value: string) {
  let bytes = 0;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code < 0xdc00 && index + 1 < value.length) {
      bytes += 4;
      index++;
    } else bytes += 3;
    if (bytes > MAX_ACTION_BYTES) break;
  }
  return bytes;
}

function createBudget() {
  let bytes = 0;
  return (value: string) => {
    bytes += utf8Bytes(value);
    if (bytes > MAX_ACTION_BYTES) throw new ActionTooLargeError();
  };
}

function toBase64(bytes: Uint8Array) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

function fromBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++)
    bytes[index] = binary.charCodeAt(index);
  return bytes;
}

/** Client: a reply as a JSON-safe call. */
export async function encodeActionCall(
  id: string,
  reply: string | FormData
): Promise<ServerActionCall> {
  if (typeof reply === 'string') return { id, reply };
  const form: [string, string | EncodedFile][] = [];
  for (const [name, value] of reply.entries())
    form.push([
      name,
      typeof value === 'string'
        ? value
        : {
            name: value.name,
            type: value.type,
            base64: toBase64(new Uint8Array(await value.arrayBuffer())),
          },
    ]);
  return { id, form };
}

function isEncodedFile(value: unknown): value is EncodedFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as EncodedFile).name === 'string' &&
    typeof (value as EncodedFile).type === 'string' &&
    typeof (value as EncodedFile).base64 === 'string'
  );
}

/**
 * Server: the reply React's `decodeReply` expects. The whole call (id,
 * reply or every entry name, value, file name, type and decoded bytes) is
 * measured in UTF-8 bytes against one budget, and the entry count is capped,
 * before any value is decoded.
 */
export function decodeActionCall(call: ServerActionCall) {
  const spend = createBudget();
  if (typeof call?.id !== 'string' || !ACTION_ID.test(call.id))
    throw new Error('Invalid server action call');
  spend(call.id);
  if ('reply' in call && typeof call.reply === 'string') {
    spend(call.reply);
    return call.reply;
  }
  if (!('form' in call) || !Array.isArray(call.form))
    throw new Error('Invalid server action call');
  if (call.form.length > MAX_ACTION_ENTRIES) throw new ActionTooLargeError();
  for (const entry of call.form) {
    const [name, value] = Array.isArray(entry) ? entry : [];
    if (typeof name !== 'string') throw new Error('Invalid server action call');
    spend(name);
    if (typeof value === 'string') spend(value);
    else if (isEncodedFile(value)) {
      spend(value.name);
      spend(value.type);
      spend(value.base64);
    } else throw new Error('Invalid server action call');
  }
  const form = new FormData();
  for (const [name, value] of call.form as [string, string | EncodedFile][])
    if (typeof value === 'string') form.append(name, value);
    else {
      const bytes = fromBase64(value.base64);
      // Decoded bytes are already within the base64 text's budget.
      form.append(name, new File([bytes], value.name, { type: value.type }));
    }
  return form;
}

/**
 * Only a function React registered as a server reference under exactly this
 * id may run: `loadServerAction` reads `module[name]`, so a prototype member
 * (`#constructor`, `#toString`) or another export's alias is rejected. Bound
 * references keep the `$$id` of the reference they were bound from.
 */
function isRegisteredAction(
  value: unknown,
  id: string
): value is (...args: unknown[]) => unknown {
  return (
    typeof value === 'function' &&
    Object.hasOwn(value, '$$id') &&
    (value as { $$typeof?: unknown }).$$typeof === SERVER_REFERENCE &&
    (value as { $$id?: unknown }).$$id === id
  );
}

/** Client: route every server reference call through `call`. */
export async function installServerActionCallback(
  call: (input: ServerActionCall) => Promise<unknown>
) {
  if (typeof window === 'undefined') return;
  const { encodeReply, setServerCallback } = await import(
    '@vitejs/plugin-rsc/browser'
  );
  setServerCallback(async (id: string, args: unknown[]) => {
    const input = await encodeActionCall(id, await encodeReply(args));
    const result = (await call(input)) as ServerActionResult | undefined;
    return result?.value;
  });
}

/** RSC environment: decode the reply, then load and run the action. */
export async function runServerAction(
  input: ServerActionCall
): Promise<ServerActionResult> {
  const reply = decodeActionCall(input);
  const { decodeReply, loadServerAction } = await import(
    '@vitejs/plugin-rsc/rsc'
  );
  const action: unknown = await loadServerAction(input.id);
  if (!isRegisteredAction(action, input.id))
    throw new Error('Unknown server action');
  const args = await decodeReply(reply);
  if (!Array.isArray(args)) throw new Error('Invalid server action call');
  return { value: await action(...args) };
}
