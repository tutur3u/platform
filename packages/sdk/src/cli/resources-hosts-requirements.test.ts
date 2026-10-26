import { describe, expect, it } from 'vitest';
import {
  type HostRegistry,
  hostRegistrySchema,
  proposedHostRegistry,
} from './resources-hosts-config';
import {
  canEverHold,
  type HostState,
  planAdmissions,
  type Waiter,
} from './resources-hosts-plan';
import {
  assertHostsHub,
  type HostCapability,
  hostsRequirements,
} from './resources-hosts-requirements';

describe('command requirements', () => {
  it.each([
    ['xcodebuild', ['test'], ['macos']],
    ['/usr/bin/xcrun', ['simctl', 'list'], ['macos']],
    ['pod', ['install'], ['macos']],
    ['flutter', ['build', 'ios'], ['flutter', 'ios']],
    ['flutter', ['build', 'ipa'], ['flutter', 'ios']],
    ['flutter', ['--verbose', 'build', 'ios'], ['flutter', 'ios']],
    ['flutter', ['build', 'macos'], ['flutter', 'macos']],
    ['flutter', ['test'], ['flutter']],
    ['flutter', ['build', 'apk'], ['flutter']],
    ['cargo', ['test'], ['rust']],
    ['docker', ['compose', 'up'], ['docker']],
    ['bun', ['run', 'test'], []],
  ])('%s %j adds %j', (command, args, expected) => {
    expect(hostsRequirements(command, args)).toEqual(expected);
  });

  it('combines explicit wrapper requirements with inferred requirements', () => {
    expect(
      hostsRequirements(
        'flutter',
        ['build', 'ios'],
        ['run', '--hosts', '--requires', 'web', '--requires', 'flutter']
      )
    ).toEqual(['flutter', 'ios', 'web']);
    expect(
      hostsRequirements('sh', ['verify.sh'], ['--requires', 'macos'])
    ).toEqual(['macos']);
  });

  it.each([{ values: [] }, { values: ['unknown'] }])(
    'rejects invalid or missing requirement $values',
    ({ values }) => {
      expect(() =>
        hostsRequirements('bun', [], ['--requires', ...values])
      ).toThrow(/--requires must be/u);
    }
  );
});

const base = proposedHostRegistry();
const registry: HostRegistry = {
  ...base,
  hosts: [
    {
      ...base.hosts[0]!,
      platform: 'darwin',
      capabilities: ['web'],
      preference: 3,
    },
    {
      ...base.hosts[1]!,
      platform: 'linux',
      capabilities: ['web', 'flutter', 'rust', 'docker'],
      preference: 1,
    },
    {
      ...base.hosts[1]!,
      id: 'studio',
      runnerId: 'runner-studio',
      platform: 'darwin',
      capabilities: ['ios', 'macos', 'flutter', 'web', 'rust', 'docker'],
      preference: 2,
    },
  ],
};
const states = (): Record<string, HostState> => ({
  m4: { healthy: true, diskFreeGiB: 100, platform: 'darwin' },
  'skr-linux-lan': { healthy: true, diskFreeGiB: 400, platform: 'linux' },
  studio: { healthy: true, diskFreeGiB: 400, platform: 'darwin' },
});
const waiter = (
  token: string,
  requires: HostCapability[],
  queuedAt = 1
): Waiter => ({
  token,
  requires,
  jobClass: 'heavy',
  project: 'project',
  queuedAt,
  bypassed: 0,
  remoteOk: true,
});

describe('capability-aware placement', () => {
  it.each<HostCapability>(['ios', 'macos'])(
    'places %s only on Studio',
    (requirement) => {
      const plan = planAdmissions(
        registry,
        states(),
        [],
        [waiter('apple', [requirement])]
      );
      expect(plan.assignments).toEqual([{ token: 'apple', hostId: 'studio' }]);
    }
  );

  it.each<HostCapability>(['flutter', 'web', 'rust', 'docker'])(
    'places portable %s on Linux then Studio when Linux is full',
    (requirement) => {
      expect(
        planAdmissions(
          registry,
          states(),
          [],
          [waiter('portable', [requirement])]
        ).assignments
      ).toEqual([{ token: 'portable', hostId: 'skr-linux-lan' }]);
      const full = states();
      full['skr-linux-lan']!.external = { heavy: 2 };
      expect(
        planAdmissions(registry, full, [], [waiter('portable', [requirement])])
          .assignments
      ).toEqual([{ token: 'portable', hostId: 'studio' }]);
    }
  );

  it('fails closed when Apple platform telemetry is missing or mismatched', () => {
    for (const platform of [undefined, 'linux']) {
      const live = states();
      live.studio!.platform = platform;
      const plan = planAdmissions(
        registry,
        live,
        [],
        [waiter('apple', ['ios'])]
      );
      expect(plan.assignments).toEqual([]);
      expect(plan.blocked.apple).toMatch(/platform telemetry/u);
    }
  });

  it('does not reserve Linux behind a starving iOS waiter', () => {
    const live = states();
    live.studio!.external = { heavy: 2 };
    const plan = planAdmissions(
      registry,
      live,
      [],
      [
        { ...waiter('apple', ['ios']), bypassed: 4 },
        waiter('portable', ['web'], 2),
      ]
    );
    expect(plan.assignments).toEqual([
      { token: 'portable', hostId: 'skr-linux-lan' },
    ]);
  });

  it('fails fast without an eligible declared capability and preserves legacy generic jobs', () => {
    expect(canEverHold(base, waiter('apple', ['ios']))).toBe(false);
    expect(canEverHold(base, waiter('generic', []))).toBe(true);
    const wrongPlatform: HostRegistry = {
      ...registry,
      hosts: [{ ...registry.hosts[2]!, platform: 'linux' }],
    };
    expect(canEverHold(wrongPlatform, waiter('apple', ['ios']))).toBe(false);
    expect(
      hostRegistrySchema.safeParse({
        ...registry,
        hosts: [{ ...registry.hosts[0]!, capabilities: ['typo'] }],
      }).success
    ).toBe(false);
  });

  it('keeps older canonical lane waiters ahead of capable local heavy work', () => {
    const local: HostRegistry = { ...registry, hosts: [registry.hosts[0]!] };
    const live = states();
    live.m4!.laneWaiters = 1;
    expect(
      planAdmissions(local, live, [], [waiter('web', ['web'])]).assignments
    ).toEqual([]);
  });
});

describe('M4 hub dispatch fence', () => {
  it('requires an explicit matching hub for remote dispatch', () => {
    expect(() => assertHostsHub(base, 'hub')).toThrow(/M4 hub/u);
    expect(() =>
      assertHostsHub({ ...base, hubHostname: 'hub' }, 'studio')
    ).toThrow(/M4 hub/u);
    expect(() =>
      assertHostsHub({ ...base, hubHostname: 'hub' }, 'hub')
    ).not.toThrow();
  });

  it('allows a local-only queue on remote hosts', () => {
    expect(() =>
      assertHostsHub({ hosts: [{ kind: 'local' }] }, 'linux')
    ).not.toThrow();
  });
});
