import { describe, expect, it } from 'vitest';
import { insertAfter, insertBefore } from '../__tests__/text-edits';
import { evaluateClassCensus } from './census-class';
import {
  type CfBinding,
  checkIdentityMembership,
  type MountEntry,
} from './census-membership';

const BINDINGS: CfBinding[] = [
  { name: 'GATEWAY_MOUNTED_PATHS', type: 'plain_text', text: '/mail' },
  { name: 'MOUNT_MAIL', type: 'service', service: 'tuturuuu-mail' },
];
const MAP: MountEntry[] = [
  { mountId: 'mail', script: 'tuturuuu-mail', base: '/mail' },
];
const ARTIFACT = JSON.stringify({
  env: 'production',
  gatewayVersionId: 'gw-2',
  registryVersion: 12,
  mounts: MAP,
});

const versionsText = (
  percentage: string,
  bindings = JSON.stringify(BINDINGS)
) => `[{"versionId":"gw-2","percentage":${percentage},"bindings":${bindings}}]`;

const baseMembership = (trafficVersions: string, artifact = ARTIFACT) => ({
  env: 'production',
  trafficVersions,
  artifact,
  artifactStatus: 'ok' as const,
  acceptedGatewayVersions: ['gw-2'],
  identityBlocked: false,
  highestRegistryVersion: 12,
});

describe('checkIdentityMembership traffic percentage', () => {
  it.each(['12.5', '0.01', '100', '50'])('accepts %s', (percentage) => {
    expect(
      checkIdentityMembership(baseMembership(versionsText(percentage)))
    ).toEqual({ ok: true, mounts: MAP, registryVersion: 12 });
  });

  it('accepts versions that split traffic fractionally', () => {
    const split = `[{"versionId":"gw-1","percentage":87.5,"bindings":${JSON.stringify(BINDINGS)}},{"versionId":"gw-2","percentage":12.5,"bindings":${JSON.stringify(BINDINGS)}}]`;
    expect(
      checkIdentityMembership({
        ...baseMembership(split),
        acceptedGatewayVersions: ['gw-1', 'gw-2'],
      }).ok
    ).toBe(true);
  });

  it.each([
    ['0', 'bad_version'],
    ['-1', 'bad_version'],
    ['100.01', 'bad_version'],
    ['1e2', 'no_traffic'],
    ['NaN', 'no_traffic'],
    ['12.50', 'no_traffic'],
    ['1.', 'no_traffic'],
    ['012.5', 'no_traffic'],
  ])('fails a percentage of %s as %s', (percentage, reason) => {
    expect(
      checkIdentityMembership(baseMembership(versionsText(percentage)))
    ).toEqual({ ok: false, reason });
  });

  it('keeps bindings and the artifact on safe integers', () => {
    const fractionalBinding = JSON.stringify([
      ...BINDINGS,
      { name: 'LIMIT', type: 'plain_text', weight: 1.5 },
    ]);
    expect(
      checkIdentityMembership(
        baseMembership(versionsText('12.5', fractionalBinding))
      )
    ).toEqual({ ok: false, reason: 'bad_bindings' });
    expect(
      checkIdentityMembership(
        baseMembership(
          versionsText('12.5'),
          insertAfter(ARTIFACT, '"registryVersion":12', '.5')
        )
      )
    ).toEqual({ ok: false, reason: 'bad_artifact' });
  });
});

describe('checkIdentityMembership trusted reads', () => {
  it('never takes identityBlocked from a polluted Object.prototype', () => {
    const proto = Object.prototype as { identityBlocked?: unknown };
    proto.identityBlocked = false;
    try {
      const { identityBlocked: _, ...rest } = baseMembership(
        versionsText('100')
      );
      expect(checkIdentityMembership(rest as never)).toEqual({
        ok: false,
        reason: 'identity_blocked',
      });
    } finally {
      delete proto.identityBlocked;
    }
  });

  it('proceeds only on an own identityBlocked of exactly false', () => {
    for (const identityBlocked of [0, '', null, undefined, 'false']) {
      expect(
        checkIdentityMembership({
          ...baseMembership(versionsText('100')),
          identityBlocked: identityBlocked as never,
        })
      ).toEqual({ ok: false, reason: 'identity_blocked' });
    }
  });

  it('reads inherited version text as missing', () => {
    const input = Object.create({ trafficVersions: versionsText('100') });
    Object.assign(input, baseMembership(''));
    delete input.trafficVersions;
    expect(checkIdentityMembership(input)).toEqual({
      ok: false,
      reason: 'no_traffic',
    });
  });
});

describe('evaluateClassCensus deployment percentage', () => {
  const bundle = '{"entries":[],"deniedKids":[]}';
  const entries = [{ entryId: 'mail', script: 'tuturuuu-mail' }];
  const reports = JSON.stringify([
    { entryId: 'mail', outcome: 'ok', versionId: 'm1', keys: bundle },
  ]);
  const deployments = (percentage: string) =>
    `{"tuturuuu-mail":{"versions":[{"versionId":"m1","percentage":${percentage},"bundle":${JSON.stringify(bundle)}}]}}`;

  it.each(['12.5', '0.01', '100'])('accepts %s', (percentage) => {
    expect(
      evaluateClassCensus({
        entries,
        deployments: deployments(percentage),
        reports,
      })
    ).toEqual({
      ok: true,
      registry: ['mail@m1'],
      reports: [{ deploymentId: 'mail@m1', body: bundle }],
    });
  });

  it.each([
    ['0', 'bad_deployment'],
    ['100.01', 'bad_deployment'],
    ['1e2', 'no_deployment'],
    ['NaN', 'no_deployment'],
    ['12.50', 'no_deployment'],
  ])('fails a percentage of %s as %s', (percentage, reason) => {
    expect(
      evaluateClassCensus({
        entries,
        deployments: deployments(percentage),
        reports,
      })
    ).toMatchObject({ ok: false, reason, entryId: 'mail' });
  });

  it('keeps reports on safe integers', () => {
    const fractional = insertBefore(reports, '"outcome"', '"weight":1.5,');
    expect(
      evaluateClassCensus({
        entries,
        deployments: deployments('12.5'),
        reports: fractional,
      })
    ).toMatchObject({ ok: false, reason: 'missing_report' });
  });

  it('reads inherited deployment text as missing', () => {
    const input = Object.create({ deployments: deployments('100') });
    Object.assign(input, { entries, reports });
    expect(evaluateClassCensus(input)).toMatchObject({
      ok: false,
      reason: 'no_deployment',
    });
  });
});
