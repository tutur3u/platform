import { createHash, timingSafeEqual } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { z } from 'zod';
import { CLI_EXIT, CliError } from '../cli-contracts';
import { CLI_ENVS } from '../cli-env';
import { writePrivateFile } from '../qa-users-secrets';
import {
  assertNoUntrustedPathSymlinks,
  assertVerifiedDirectory,
  captureVerifiedDirectory,
  readPrivateJsonFile,
} from '../upskii/http';
import { assertSafeInfraText, infraEnvSecrets } from './client';

const MAX_PACKET_BYTES = 1024 * 1024;
const MAX_JSON_DEPTH = 64;
const LONE_SURROGATE = /[\uD800-\uDFFF]/u;

function invalidPacket(): CliError {
  return new CliError({
    code: 'INVALID_CHANGE_PACKET',
    message:
      'Invalid change packet. Expected version 1 and JSON-compatible fields.',
  });
}

const nonemptyText = z
  .string()
  .min(1)
  .refine((value) => value.trim() !== '');
export const packetProviderSchema = z.enum([
  'cloudflare',
  'tuturuuu-infra',
  'github-runners',
]);
const changePacketBodySchema = z.strictObject({
  version: z.literal(1),
  env: z.enum(CLI_ENVS),
  target: nonemptyText,
  provider: packetProviderSchema,
  action: nonemptyText,
  summary: nonemptyText,
  reason: nonemptyText,
  changes: z.array(z.unknown()),
  rollbackPlan: nonemptyText,
  createdAt: z.iso.datetime({ offset: true }),
});

export const packetDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/u);
export const changePacketSchema = changePacketBodySchema.extend({
  digest: packetDigestSchema,
});
export type ChangePacketBody = z.infer<typeof changePacketBodySchema>;
export type ChangePacket = z.infer<typeof changePacketSchema>;
type CreateChangePacketInput = Omit<
  ChangePacketBody,
  'version' | 'createdAt'
> & { createdAt?: string };
type Secrets = ReturnType<typeof infraEnvSecrets>;

function jsonString(value: string): string {
  if (LONE_SURROGATE.test(value)) throw invalidPacket();
  return JSON.stringify(value);
}

export function canonicalizeJson(value: unknown): string {
  function visit(current: unknown, depth: number): string {
    if (depth > MAX_JSON_DEPTH) throw invalidPacket();
    if (typeof current === 'string') return jsonString(current);
    if (
      current === null ||
      typeof current === 'boolean' ||
      (typeof current === 'number' && Number.isFinite(current))
    )
      return JSON.stringify(current);

    if (Array.isArray(current)) {
      const entries = Array.from({ length: current.length }, (_, index) =>
        visit(current[index], depth + 1)
      );
      return `[${entries.join(',')}]`;
    }

    if (typeof current !== 'object' || current === null) throw invalidPacket();
    const prototype: unknown = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null)
      throw invalidPacket();
    const fields = Object.entries(current).sort(([left], [right]) =>
      left < right ? -1 : Number(left !== right)
    );
    return `{${fields.map(([key, entry]) => `${jsonString(key)}:${visit(entry, depth + 1)}`).join(',')}}`;
  }

  return visit(value, 0);
}

export function computeChangePacketDigest(body: ChangePacketBody): string {
  const hex = createHash('sha256').update(canonicalizeJson(body)).digest('hex');
  return `sha256:${hex}`;
}

export function changePacketDigestsMatch(left: string, right: string): boolean {
  if (
    !packetDigestSchema.safeParse(left).success ||
    !packetDigestSchema.safeParse(right).success
  ) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(left.slice(7), 'hex'),
    Buffer.from(right.slice(7), 'hex')
  );
}

function assertPacketText(serialized: string, secrets: Secrets): void {
  if (Buffer.byteLength(serialized) + 1 > MAX_PACKET_BYTES)
    throw invalidPacket();
  assertSafeInfraText(serialized, secrets);
}

export function createChangePacket(
  input: CreateChangePacketInput,
  secrets: Secrets = infraEnvSecrets(process.env)
): ChangePacket {
  const candidate = {
    ...input,
    version: 1,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  const serialized = canonicalizeJson(candidate);
  assertPacketText(serialized, secrets);
  const body = changePacketBodySchema.safeParse(JSON.parse(serialized));
  if (!body.success) throw invalidPacket();
  const packet = { ...body.data, digest: computeChangePacketDigest(body.data) };
  assertPacketText(canonicalizeJson(packet), secrets);
  return packet;
}

export function verifyChangePacket(
  packet: unknown,
  secrets: Secrets = infraEnvSecrets(process.env)
): ChangePacket {
  const serialized = canonicalizeJson(packet);
  assertPacketText(serialized, secrets);
  const result = changePacketSchema.safeParse(JSON.parse(serialized));
  if (!result.success) throw invalidPacket();

  const { digest, ...body } = result.data;
  if (!changePacketDigestsMatch(digest, computeChangePacketDigest(body))) {
    throw new CliError({
      code: 'CHANGE_PACKET_DIGEST_MISMATCH',
      exitCode: CLI_EXIT.conflict,
      message: 'Change packet digest does not match its contents.',
    });
  }
  return result.data;
}

function unsafePacketPath(): CliError {
  return new CliError({
    code: 'UNSAFE_PACKET_PATH',
    exitCode: CLI_EXIT.policy,
    message:
      'Packet paths must be non-symlink file paths. Output requires an existing trusted 0700 directory.',
  });
}

function packetPath(rawPath: string, secrets: Secrets): string {
  assertSafeInfraText(rawPath, secrets);
  const segments = process.platform === 'win32' ? /[\\/]/u : /\//u;
  if (
    !rawPath ||
    rawPath.endsWith(sep) ||
    rawPath.split(segments).includes('..')
  ) {
    throw unsafePacketPath();
  }
  const target = resolve(rawPath);
  assertSafeInfraText(target, secrets);
  return target;
}

export async function writeChangePacketFile(
  outPath: string,
  packet: ChangePacket,
  secrets: Secrets = infraEnvSecrets(process.env)
): Promise<void> {
  const serialized = canonicalizeJson(verifyChangePacket(packet, secrets));
  const target = packetPath(outPath, secrets);
  try {
    await assertNoUntrustedPathSymlinks(target);
    const anchor = await captureVerifiedDirectory(dirname(target));
    if (((await lstat(anchor.realDir)).mode & 0o7777) !== 0o700) {
      throw unsafePacketPath();
    }
    const verifiedTarget = join(anchor.realDir, basename(target));
    assertSafeInfraText(verifiedTarget, secrets);
    await assertNoUntrustedPathSymlinks(verifiedTarget);
    await assertVerifiedDirectory(anchor);
    await writePrivateFile(verifiedTarget, `${serialized}\n`);
    await assertVerifiedDirectory(anchor);
  } catch (error) {
    if (error instanceof CliError && error.code === 'CREDENTIAL_LEAK_BLOCKED')
      throw error;
    throw unsafePacketPath();
  }
}

export async function readChangePacketFile(
  filePath: string,
  secrets: Secrets = infraEnvSecrets(process.env)
): Promise<ChangePacket> {
  const target = packetPath(filePath, secrets);
  let parsed: unknown;
  try {
    await assertNoUntrustedPathSymlinks(target);
    parsed = await readPrivateJsonFile(target, 'change packet');
  } catch (error) {
    if (error instanceof CliError && error.exitCode === CLI_EXIT.notFound) {
      throw new CliError({
        code: 'FILE_NOT_FOUND',
        exitCode: CLI_EXIT.notFound,
        message: 'Change packet file not found.',
      });
    }
    throw unsafePacketPath();
  }
  return verifyChangePacket(parsed, secrets);
}
