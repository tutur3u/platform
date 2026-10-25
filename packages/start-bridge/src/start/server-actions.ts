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

/** Most action bodies; larger replies are rejected before decoding. */
export const MAX_ACTION_FORM_BYTES = 10 * 1024 * 1024;

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

/** Server: the reply React's `decodeReply` expects. */
export function decodeActionCall(call: ServerActionCall) {
  if (typeof call?.id !== 'string')
    throw new Error('Invalid server action call');
  if ('reply' in call && typeof call.reply === 'string') return call.reply;
  if (!('form' in call) || !Array.isArray(call.form))
    throw new Error('Invalid server action call');
  const form = new FormData();
  let bytes = 0;
  for (const entry of call.form) {
    const [name, value] = Array.isArray(entry) ? entry : [];
    if (typeof name !== 'string') throw new Error('Invalid server action call');
    if (typeof value === 'string') {
      bytes += value.length;
      form.append(name, value);
    } else if (
      value &&
      typeof value.base64 === 'string' &&
      typeof value.name === 'string' &&
      typeof value.type === 'string'
    ) {
      bytes += value.base64.length;
      if (bytes > MAX_ACTION_FORM_BYTES)
        throw new Error('Server action arguments are too large');
      form.append(
        name,
        new File([fromBase64(value.base64)], value.name, { type: value.type })
      );
    } else throw new Error('Invalid server action call');
    if (bytes > MAX_ACTION_FORM_BYTES)
      throw new Error('Server action arguments are too large');
  }
  return form;
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
  const action = await loadServerAction(input.id);
  if (typeof action !== 'function') throw new Error('Unknown server action');
  const args = await decodeReply(reply);
  if (!Array.isArray(args)) throw new Error('Invalid server action call');
  return { value: await action(...args) };
}
