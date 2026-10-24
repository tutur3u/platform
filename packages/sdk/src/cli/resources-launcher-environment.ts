import { z } from 'zod';

export const resourceEnvironmentLimit = 2 * 1024 * 1024;
const packetSchema = z
  .object({
    nonce: z.string().regex(/^[a-f0-9]{64}$/u),
    env: z.record(
      z
        .string()
        .min(1)
        .refine((key) => !key.includes('=') && !key.includes('\0')),
      z.string().refine((value) => !value.includes('\0'))
    ),
  })
  .strict();

// Application credentials/options travel over a private pipe, never argv or the
// relay's interpreter environment. In particular NODE_OPTIONS cannot preload it.
export function relayEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = {};
  for (const name of [
    'HOME',
    'PATH',
    'TMPDIR',
    'TMP',
    'TEMP',
    'LANG',
    'LC_ALL',
    'TERM',
    'NO_COLOR',
    'SYSTEMROOT',
    'WINDIR',
  ]) {
    if (env[name] !== undefined) result[name] = env[name];
  }
  return result;
}
export function encodeWorkloadEnvironment(
  nonce: string,
  env: NodeJS.ProcessEnv
) {
  const packet = packetSchema.parse({
    nonce,
    env: Object.fromEntries(
      Object.entries(env).filter((entry) => typeof entry[1] === 'string')
    ),
  });
  const bytes = Buffer.from(JSON.stringify(packet));
  if (bytes.length > resourceEnvironmentLimit)
    throw new Error(
      'Resource workload environment exceeds the 2 MiB transfer limit; reduce its size before retrying.'
    );
  return bytes;
}
export function decodeWorkloadEnvironment(bytes: Buffer, nonce: string) {
  if (bytes.length > resourceEnvironmentLimit)
    throw new Error('Resource environment transfer limit exceeded');
  const packet = packetSchema.parse(JSON.parse(bytes.toString('utf8')));
  if (packet.nonce !== nonce)
    throw new Error('Resource environment nonce mismatch');
  return packet.env;
}
