import { hostname } from 'node:os';
import { basename } from 'node:path';
import { z } from 'zod';
import type { HostRegistry } from './resources-hosts-config';

export const hostCapabilitySchema = z.enum([
  'ios',
  'macos',
  'flutter',
  'web',
  'rust',
  'docker',
  'supabase',
]);
export type HostCapability = z.infer<typeof hostCapabilitySchema>;

// Explicit requirements augment direct tools and known repository wrappers.
// Arbitrary shell and package-script bodies are never evaluated for inference.
export function hostsRequirements(
  command: string,
  args: string[],
  options: string[] = []
): HostCapability[] {
  const required = new Set<HostCapability>();
  for (let i = 0; i < options.length; i++) {
    if (options[i] !== '--requires') continue;
    const parsed = hostCapabilitySchema.safeParse(options[++i]);
    if (!parsed.success)
      throw new Error(
        '--requires must be ios, macos, flutter, web, rust, docker or supabase.'
      );
    required.add(parsed.data);
  }
  const tool = basename(command);
  if (['xcodebuild', 'xcrun', 'pod', 'codesign'].includes(tool))
    required.add('macos');
  if (tool === 'flutter') {
    required.add('flutter');
    if (args.includes('ios') || args.includes('ipa')) required.add('ios');
    if (args.includes('macos')) required.add('macos');
  }
  if (['cargo', 'rustc', 'rustup'].includes(tool)) required.add('rust');
  if (tool === 'docker') required.add('docker');
  if (tool === 'supabase') {
    required.add('supabase');
    if (args.some((arg) => ['start', 'reset', 'test'].includes(arg)))
      required.add('docker');
  }
  if (tool === 'dart' || tool === 'melos') required.add('flutter');
  const wrapper = ['bun', 'bunx', 'npm', 'npx', 'pnpm', 'yarn'].includes(tool);
  if (wrapper) {
    if (args.some((arg) => /^sb:/u.test(arg))) {
      required.add('supabase');
      required.add('docker');
    }
    if (
      args.some((arg) =>
        /(?:^|[:/\\_-])(?:mobile|flutter|melos)(?:$|[:/\\_-])/u.test(arg)
      ) ||
      /(?:^|[/\\])apps[/\\]mobile(?:$|[/\\])/u.test(process.cwd())
    )
      required.add('flutter');
    if (args.some((arg) => /^build:(?:android|ios|macos)(?:$|:)/u.test(arg)))
      required.add('flutter');
    if (args.some((arg) => /^build:ios(?:$|:)/u.test(arg))) required.add('ios');
    if (args.some((arg) => /^build:macos(?:$|:)/u.test(arg)))
      required.add('macos');
    if (
      options.includes('--host') &&
      options.includes('auto') &&
      !required.size &&
      (args.includes('run') || ['npm', 'pnpm', 'yarn'].includes(tool)) &&
      args.some((arg) =>
        /^(?:build|test|check|lint|analyze|type-check|validate)(?:$|:)/u.test(
          arg
        )
      )
    )
      throw new Error(
        'Automatic placement cannot infer this heavy script toolchain; declare --requires explicitly.'
      );
  }
  return [...required].sort();
}

export function capabilityBlocker(
  host: { capabilities?: HostCapability[]; platform?: 'darwin' | 'linux' },
  required: HostCapability[] = []
) {
  const missing = required.filter((item) => !host.capabilities?.includes(item));
  if (missing.length) return `missing capabilities: ${missing.join(', ')}`;
  if (
    required.some((item) => item === 'ios' || item === 'macos') &&
    host.platform !== 'darwin'
  )
    return 'Apple jobs require a declared darwin host';
  return undefined;
}

export function assertHostsHub(
  registry: { hubHostname?: string; hosts: { kind: string }[] },
  currentHostname = hostname()
) {
  if (!registry.hosts.some((host) => host.kind === 'runner')) return;
  if (!registry.hubHostname || registry.hubHostname !== currentHostname)
    throw new Error(
      'Multi-host dispatch must run on the configured hubHostname; submit from the M4 hub. Remote hosts must use their local canonical queue.'
    );
}

export function assertNestedHostRequirements(
  registry: HostRegistry | undefined,
  required: HostCapability[]
) {
  const host = registry?.hosts.find((entry) => entry.kind === 'local');
  if (!host)
    throw new Error(
      'Nested --hosts requires a configured local host to validate its capabilities.'
    );
  const blocker = capabilityBlocker(host, required);
  if (blocker)
    throw new Error(`Nested --hosts cannot reuse local admission: ${blocker}.`);
  if (host.platform && host.platform !== process.platform)
    throw new Error(
      `Nested --hosts cannot reuse local admission: actual platform differs from ${host.platform}.`
    );
}
