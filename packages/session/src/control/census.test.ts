import { describe, expect, it } from 'vitest';
import {
  createWorld,
  keyEntry,
  keySetJson,
  NOW,
} from '../__tests__/token-fixtures';
import { buildCensus, publicationHolds } from '../tokens';
import {
  type ActiveDeployment,
  type EntryReport,
  evaluateClassCensus,
  identityEntries,
} from './census-class';
import {
  type CfBinding,
  checkIdentityMembership,
  type GatewayTrafficVersion,
  type MountEntry,
  projectMountMap,
} from './census-membership';

const paths = (text: string): CfBinding => ({
  name: 'GATEWAY_MOUNTED_PATHS',
  type: 'plain_text',
  text,
});
const service = (name: string, script: string): CfBinding => ({
  name,
  type: 'service',
  service: script,
});

const BINDINGS: CfBinding[] = [
  paths('/mail,/mail/*,/learn,/api,/api/*,/Bad,/x-y/*,/orphan, ,'),
  service('MOUNT_MAIL', 'tuturuuu-mail'),
  service('MOUNT_LEARN', 'tuturuuu-learn'),
  service('MOUNT_X_Y', 'tuturuuu-xy'),
  service('MOUNT_API', 'tuturuuu-api'),
  service('MOUNT_UNLISTED', 'tuturuuu-unlisted'),
  { name: 'MOUNT_ORPHAN', type: 'plain_text', text: 'not a service' },
  { name: 'AUTH', type: 'service', service: 'tuturuuu-auth' },
];

const asText = (value: unknown) =>
  (typeof value === 'string' ? value : JSON.stringify(value)) as string;

const project = (bindings: unknown) => projectMountMap(asText(bindings));

const MAP: MountEntry[] = [
  { mountId: 'learn', script: 'tuturuuu-learn', base: '/learn' },
  { mountId: 'mail', script: 'tuturuuu-mail', base: '/mail' },
  { mountId: 'x-y', script: 'tuturuuu-xy', base: '/x-y' },
];

describe('projectMountMap', () => {
  it('projects GATEWAY_MOUNTED_PATHS and MOUNT_<SEGMENT> service bindings as the gateway admits them', () => {
    expect(project(BINDINGS)).toEqual({ ok: true, mounts: MAP });
  });

  it('projects nothing without the paths variable', () => {
    expect(project([service('MOUNT_MAIL', 'tuturuuu-mail')])).toEqual({
      ok: true,
      mounts: [],
    });
  });

  it.each([
    ['a duplicate binding name', [...BINDINGS, service('MOUNT_MAIL', 'other')]],
    [
      'a non-text paths variable',
      [{ name: 'GATEWAY_MOUNTED_PATHS', type: 'secret_text' }],
    ],
    [
      'a service binding without a script',
      [paths('/mail'), { name: 'MOUNT_MAIL', type: 'service' }],
    ],
    ['a binding without a type', [{ name: 'X' }]],
    [
      'a duplicate service member',
      '[{"name":"GATEWAY_MOUNTED_PATHS","type":"plain_text","text":"/mail"},{"name":"MOUNT_MAIL","type":"service","service":"tuturuuu-mail","service":"evil"}]',
    ],
    [
      'a binding name only under __proto__',
      '[{"__proto__":{"name":"MOUNT_MAIL"},"type":"service","service":"x"}]',
    ],
    ['an object root', '{"0":{"name":"X","type":"service"}}'],
    ['unparseable text', '[{"name":"X"'],
  ])('fails on %s', (_, bindings) => {
    expect(project(bindings)).toEqual({ ok: false });
  });

  it('never accepts a structured binding array in place of JSON text', () => {
    expect(projectMountMap(BINDINGS as never)).toEqual({ ok: false });
  });
});

const version = (
  versionId: string,
  bindings: CfBinding[] = BINDINGS,
  percentage = 100
): GatewayTrafficVersion => ({ versionId, percentage, bindings });

const artifact = (over: Record<string, unknown> = {}) => ({
  env: 'production',
  gatewayVersionId: 'gw-2',
  registryVersion: 12,
  mounts: MAP,
  ...over,
});

type MembershipInput = Parameters<typeof checkIdentityMembership>[0];

function membership(
  over: Partial<Omit<MembershipInput, 'trafficVersions' | 'artifact'>> & {
    trafficVersions?: unknown;
    artifact?: unknown;
  } = {}
) {
  const merged = {
    env: 'production',
    trafficVersions: [version('gw-2')] as unknown,
    artifact: artifact() as unknown,
    artifactStatus: 'ok' as const,
    acceptedGatewayVersions: ['gw-1', 'gw-2'],
    identityBlocked: false,
    highestRegistryVersion: 12 as number | null,
    ...over,
  };
  return checkIdentityMembership({
    ...merged,
    trafficVersions: asText(merged.trafficVersions),
    artifact: asText(merged.artifact),
  });
}

describe('checkIdentityMembership', () => {
  it('passes when list() equals the map every accepted traffic version projects', () => {
    expect(
      membership({
        trafficVersions: [
          version('gw-1', [...BINDINGS].reverse(), 40),
          version('gw-2', BINDINGS, 60),
        ],
        artifact: artifact({ mounts: [...MAP].reverse() }),
      })
    ).toEqual({ ok: true, mounts: MAP, registryVersion: 12 });
  });

  it('fails two traffic versions with different maps', () => {
    const other = [...BINDINGS, service('MOUNT_LEARN_2', 'x')].map((binding) =>
      binding.name === 'MOUNT_LEARN'
        ? service('MOUNT_LEARN', 'tuturuuu-learn-next')
        : binding
    );
    expect(
      membership({
        trafficVersions: [
          version('gw-1', BINDINGS, 50),
          version('gw-2', other, 50),
        ],
      })
    ).toEqual({ ok: false, reason: 'version_maps_differ' });
  });

  it('fails when a live gateway version binds a mount absent from the artifact', () => {
    expect(
      membership({ artifact: artifact({ mounts: MAP.slice(1) }) })
    ).toEqual({
      ok: false,
      reason: 'missing_entry',
    });
  });

  it.each([
    [
      'an extra entry',
      {
        mounts: [
          ...MAP,
          { mountId: 'nova', script: 'tuturuuu-nova', base: '/nova' },
        ],
      },
      'extra_entry',
    ],
    ['a duplicate mountId', { mounts: [...MAP, MAP[0]] }, 'duplicate_entry'],
    [
      'a duplicate base',
      { mounts: [...MAP, { mountId: 'other', script: 's', base: '/mail' }] },
      'duplicate_entry',
    ],
    [
      'another script',
      { mounts: [{ ...MAP[0], script: 'evil' }, ...MAP.slice(1)] },
      'entry_mismatch',
    ],
    [
      'a version without traffic',
      { gatewayVersionId: 'gw-1' },
      'artifact_version_without_traffic',
    ],
    ['a lower registryVersion', { registryVersion: 11 }, 'registry_rollback'],
    ['another environment', { env: 'staging' }, 'wrong_env'],
    ['an extra member', { extra: 1 }, 'bad_artifact'],
    ['a malformed entry', { mounts: [{ mountId: 'mail' }] }, 'bad_artifact'],
  ])('fails an artifact with %s', (_, over, reason) => {
    expect(membership({ artifact: artifact(over) })).toEqual({
      ok: false,
      reason,
    });
  });

  it.each([
    [
      'a duplicate registryVersion',
      '{"env":"production","gatewayVersionId":"gw-2","registryVersion":99,"registryVersion":12,"mounts":[]}',
    ],
    [
      'env only under __proto__',
      '{"__proto__":{"env":"production"},"gatewayVersionId":"gw-2","registryVersion":12,"mounts":[]}',
    ],
    [
      'a string registryVersion',
      '{"env":"production","gatewayVersionId":"gw-2","registryVersion":"12","mounts":[]}',
    ],
    ['an array root', '[]'],
    ['unparseable text', '{"env":'],
  ])('fails artifact text with %s', (_, text) => {
    expect(membership({ artifact: text })).toEqual({
      ok: false,
      reason: 'bad_artifact',
    });
  });

  it('matches the structured outcome for equivalent artifact text', () => {
    const reordered = `{ "mounts": ${JSON.stringify([...MAP].reverse())}, "registryVersion": 12, "gatewayVersionId": "gw-2", "env": "production" }`;
    expect(membership({ artifact: reordered })).toEqual(membership());
  });

  it.each([
    [
      'a duplicate versionId',
      `[{"versionId":"gw-9","versionId":"gw-2","percentage":100,"bindings":[]}]`,
      'no_traffic',
    ],
    [
      'a versionId only under __proto__',
      `[{"__proto__":{"versionId":"gw-2"},"percentage":100,"bindings":[]}]`,
      'bad_version',
    ],
    [
      'bindings that are not an array',
      `[{"versionId":"gw-2","percentage":100,"bindings":{}}]`,
      'bad_bindings',
    ],
    ['an object root', '{}', 'no_traffic'],
  ])('fails traffic version text with %s', (_, text, reason) => {
    expect(membership({ trafficVersions: text })).toEqual({
      ok: false,
      reason,
    });
  });

  it('never accepts structured versions or artifact in place of JSON text', () => {
    const input = {
      env: 'production',
      trafficVersions: asText([version('gw-2')]),
      artifact: asText(artifact()),
      artifactStatus: 'ok' as const,
      acceptedGatewayVersions: ['gw-1', 'gw-2'],
      identityBlocked: false,
      highestRegistryVersion: 12,
    };
    expect(
      checkIdentityMembership({
        ...input,
        trafficVersions: [version('gw-2')] as never,
      })
    ).toEqual({ ok: false, reason: 'no_traffic' });
    expect(
      checkIdentityMembership({ ...input, artifact: artifact() as never })
    ).toEqual({ ok: false, reason: 'bad_artifact' });
  });

  it('copies the accepted versions once, ignoring an overridden iterator', () => {
    const accepted = ['gw-2'];
    Object.setPrototypeOf(
      accepted,
      Object.assign(Object.create(Array.prototype), {
        *[Symbol.iterator]() {
          yield 'gw-evil';
        },
      })
    );
    expect(membership({ acceptedGatewayVersions: accepted }).ok).toBe(true);
  });

  it('ignores an identityBlocked accessor as missing, which blocks', () => {
    let reads = 0;
    const input = {
      env: 'production',
      trafficVersions: asText([version('gw-2')]),
      artifact: asText(artifact()),
      artifactStatus: 'ok' as const,
      acceptedGatewayVersions: ['gw-2'],
      highestRegistryVersion: 12,
      get identityBlocked() {
        reads += 1;
        return false;
      },
    };
    expect(checkIdentityMembership(input)).toEqual({
      ok: false,
      reason: 'identity_blocked',
    });
    expect(reads).toBe(0);
  });

  it('accepts an equal or greater registryVersion and reports it', () => {
    expect(
      membership({ artifact: artifact({ registryVersion: 13 }) })
    ).toMatchObject({
      ok: true,
      registryVersion: 13,
    });
    expect(membership({ highestRegistryVersion: null }).ok).toBe(true);
  });

  it.each([
    [
      'a traffic version the guard has not accepted',
      { acceptedGatewayVersions: ['gw-1'] },
      'unaccepted_version',
    ],
    ['a blocked identity class', { identityBlocked: true }, 'identity_blocked'],
    ['no traffic version', { trafficVersions: [] }, 'no_traffic'],
    [
      'a duplicate traffic version',
      { trafficVersions: [version('gw-2'), version('gw-2')] },
      'bad_version',
    ],
    [
      'a zero-traffic version',
      { trafficVersions: [version('gw-2', BINDINGS, 0)] },
      'bad_version',
    ],
    [
      'a list() timeout',
      { artifactStatus: 'timeout' as const },
      'artifact_unavailable',
    ],
    [
      'a list() error',
      { artifactStatus: 'error' as const },
      'artifact_unavailable',
    ],
  ])('fails on %s', (_, over, reason) => {
    expect(membership(over)).toEqual({ ok: false, reason });
  });
});

const ok = (entryId: string, versionId: string, keys: string): EntryReport => ({
  entryId,
  outcome: 'ok',
  versionId,
  keys,
});

describe('evaluateClassCensus', () => {
  const entries = identityEntries(MAP.slice(0, 2));
  const bundle = '{"entries":[],"deniedKids":[]}';
  const deployments: Record<string, ActiveDeployment> = {
    'tuturuuu-learn': {
      versions: [{ versionId: 'l1', percentage: 100, bundle }],
    },
    'tuturuuu-mail': {
      versions: [{ versionId: 'm1', percentage: 100, bundle }],
    },
  };
  const reports = [ok('learn', 'l1', bundle), ok('mail', 'm1', bundle)];
  const run = (
    over: {
      entries?: Parameters<typeof evaluateClassCensus>[0]['entries'];
      deployments?: unknown;
      reports?: unknown;
    } = {}
  ) => {
    const merged = {
      entries,
      deployments: deployments as unknown,
      reports: reports as unknown,
      ...over,
    };
    return evaluateClassCensus({
      entries: merged.entries,
      deployments: asText(merged.deployments),
      reports: asText(merged.reports),
    });
  };

  it('yields one registry id and report per live version', () => {
    expect(run()).toEqual({
      ok: true,
      registry: ['learn@l1', 'mail@m1'],
      reports: [
        { deploymentId: 'learn@l1', body: bundle },
        { deploymentId: 'mail@m1', body: bundle },
      ],
    });
  });

  it('compares the reported keys with the configured bundle canonically', () => {
    const reordered = '{ "deniedKids": [], "entries": [] }';
    expect(
      run({
        reports: [ok('learn', 'l1', reordered), reports[1] as EntryReport],
      }).ok
    ).toBe(true);
  });

  it.each([
    [
      'a timeout',
      [{ entryId: 'learn', outcome: 'timeout' }, reports[1]],
      'timeout',
    ],
    ['an error', [{ entryId: 'learn', outcome: 'error' }, reports[1]], 'error'],
    ['a missing entry', [reports[1]], 'missing_report'],
    [
      'a report for an unpublished entry',
      [...reports, ok('nova', 'n1', bundle)],
      'unpublished_report',
    ],
    ['a duplicate report', [...reports, reports[0]], 'duplicate_report'],
    [
      'a version not in the deployment',
      [ok('learn', 'l9', bundle), reports[1]],
      'unknown_version',
    ],
    [
      'different keys',
      [ok('learn', 'l1', '{"entries":[1],"deniedKids":[]}'), reports[1]],
      'key_mismatch',
    ],
    [
      'unparseable keys',
      [ok('learn', 'l1', 'nope'), reports[1]],
      'key_mismatch',
    ],
  ])('fails the class on %s', (_, list, reason) => {
    expect(run({ reports: list })).toMatchObject({
      ok: false,
      reason,
    });
  });

  it('fails an entry without an active deployment, or a duplicate entry', () => {
    expect(
      run({ deployments: { ...deployments, 'tuturuuu-mail': 'unavailable' } })
    ).toMatchObject({
      reason: 'no_deployment',
      entryId: 'mail',
    });
    expect(
      run({
        deployments: {
          'tuturuuu-learn': deployments['tuturuuu-learn'] as ActiveDeployment,
        },
      })
    ).toMatchObject({ reason: 'no_deployment' });
    expect(
      run({ entries: [...entries, entries[0] as (typeof entries)[0]] })
    ).toMatchObject({
      reason: 'duplicate_entry',
    });
  });

  it('matches the structured outcome for equivalent JSON text', () => {
    const text = (value: unknown) =>
      JSON.stringify(value, null, 2).replace(/\n/g, '\r\n');
    expect(
      run({ deployments: text(deployments), reports: text(reports) })
    ).toEqual(run());
  });

  it.each([
    [
      'a duplicate outcome in a report',
      {
        reports: `[{"entryId":"learn","outcome":"ok","outcome":"error","versionId":"l1","keys":"{}"}]`,
      },
      'missing_report',
    ],
    [
      'an entryId only under __proto__',
      {
        reports: `[{"__proto__":{"entryId":"learn"},"outcome":"ok","versionId":"l1","keys":"{}"}]`,
      },
      'unpublished_report',
    ],
    [
      'a numeric versionId',
      {
        reports: JSON.stringify([
          { ...ok('learn', 'l1', bundle), versionId: 1 },
          reports[1],
        ]),
      },
      'unknown_version',
    ],
    [
      'an object for keys',
      {
        reports: JSON.stringify([
          { ...ok('learn', 'l1', bundle), keys: { entries: [] } },
          reports[1],
        ]),
      },
      'key_mismatch',
    ],
    [
      'a duplicate deployment script',
      {
        deployments: `{"tuturuuu-learn":"unavailable","tuturuuu-learn":${JSON.stringify(deployments['tuturuuu-learn'])}}`,
      },
      'no_deployment',
    ],
    [
      'versions only under __proto__',
      {
        deployments: JSON.stringify(deployments).replace(
          '{"versions"',
          '{"__proto__":{"versions":[]},"other"'
        ),
      },
      'bad_deployment',
    ],
    [
      'a structured report array',
      { reports: reports as never },
      'missing_report',
    ],
    [
      'a structured deployment record',
      { deployments: deployments as never },
      'no_deployment',
    ],
  ])('fails the class on JSON text with %s', (_, over, reason) => {
    const census = evaluateClassCensus({
      entries,
      deployments: asText(deployments),
      reports: asText(reports),
      ...over,
    });
    expect(census).toMatchObject({ ok: false, reason });
  });

  it('copies the trusted entries by own index', () => {
    const copied = [...entries];
    Object.setPrototypeOf(
      copied,
      Object.assign(Object.create(Array.prototype), {
        *[Symbol.iterator]() {},
      })
    );
    expect(run({ entries: copied })).toMatchObject({
      ok: true,
      registry: ['learn@l1', 'mail@m1'],
    });
    const inherited = Object.create({ entryId: 'learn', script: 'x' });
    expect(run({ entries: [inherited] })).toMatchObject({
      ok: false,
      reason: 'duplicate_entry',
    });
  });

  it('passes an empty class with an empty registry', () => {
    expect(run({ entries: [], reports: [] })).toEqual({
      ok: true,
      registry: [],
      reports: [],
    });
  });

  describe('with slice 2a publication', () => {
    async function holdsWith(oldBundleHoldsKey: boolean) {
      const world = await createWorld(['identity']);
      const entry = world.signer.entries[0];
      if (!entry) throw new Error('no entry');
      const other = await keyEntry({
        kid: 'identity-0',
        class: 'identity',
        status: 'active',
      });
      const oldBundle = oldBundleHoldsKey
        ? world.verifierJson
        : keySetJson([other.json]);
      const result = evaluateClassCensus({
        entries: identityEntries([MAP[1] as MountEntry]),
        deployments: JSON.stringify({
          'tuturuuu-mail': {
            versions: [
              { versionId: 'm1', percentage: 30, bundle: oldBundle },
              { versionId: 'm2', percentage: 70, bundle: world.verifierJson },
            ],
          },
        }),
        reports: JSON.stringify([ok('mail', 'm2', world.verifierJson)]),
      });
      if (!result.ok) throw new Error(result.reason);
      const census = await buildCensus({
        takenAt: NOW,
        jwksBody: world.jwksBody,
        reports: { identity: result.reports },
      });
      return publicationHolds(entry, {
        registry: { identity: result.registry },
        census,
        now: NOW,
      });
    }

    it('holds a key only when both live versions of an entry hold it', async () => {
      expect(await holdsWith(true)).toBe(true);
      expect(await holdsWith(false)).toBe(false);
    });
  });
});
