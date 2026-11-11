import { describe, expect, it } from 'vitest';
import {
  externalProjectAdminBindingMatches,
  resolveExternalProjectAdminMapping,
} from './external-project-admin-binding';

const mapping = {
  origin: 'https://site.example',
  workspaceId: '22222222-2222-4222-8222-222222222222',
  canonicalProjectId: 'fictional-site',
};
const raw = JSON.stringify([mapping]);
const binding = {
  enabled: true,
  workspace_id: mapping.workspaceId,
  canonical_id: mapping.canonicalProjectId,
  canonical_project: { id: mapping.canonicalProjectId, is_active: true },
};

describe('external project admin site identity', () => {
  it('resolves only one exact deployment-owned HTTPS origin', () => {
    expect(resolveExternalProjectAdminMapping(raw, mapping.origin)).toEqual(
      mapping
    );
    for (const origin of [
      'http://site.example',
      'https://site.example/',
      'https://other.example',
      'https://site.example.evil.test',
      'https://user@site.example',
    ]) {
      expect(resolveExternalProjectAdminMapping(raw, origin)).toBeNull();
    }
  });
  it('fails closed without a real unambiguous mapping', () => {
    for (const config of [
      undefined,
      '',
      '{}',
      'null',
      'invalid',
      JSON.stringify([mapping, mapping]),
      JSON.stringify([{ ...mapping, workspaceId: 'IEEAI' }]),
    ]) {
      expect(
        resolveExternalProjectAdminMapping(config, mapping.origin)
      ).toBeNull();
    }
  });
  it('requires the enabled active canonical project in the mapped workspace', () => {
    const check = (value: typeof binding) =>
      externalProjectAdminBindingMatches({
        mapping,
        binding: value,
        workspaceId: mapping.workspaceId,
      });
    expect(check(binding)).toBe(true);
    expect(check({ ...binding, enabled: false })).toBe(false);
    expect(check({ ...binding, workspace_id: 'other' })).toBe(false);
    expect(check({ ...binding, canonical_id: 'other' })).toBe(false);
    expect(
      check({ ...binding, canonical_project: { id: 'other', is_active: true } })
    ).toBe(false);
    expect(
      check({
        ...binding,
        canonical_project: { id: mapping.canonicalProjectId, is_active: false },
      })
    ).toBe(false);
    expect(
      externalProjectAdminBindingMatches({
        mapping,
        binding,
        workspaceId: 'other',
      })
    ).toBe(false);
  });
  it('accepts dotted canonical project keys shared by approved host mappings', () => {
    const site = { ...mapping, canonicalProjectId: 'conference.example' };
    const docs = { ...site, origin: 'https://docs.example' };
    const config = JSON.stringify([site, docs]);
    expect(resolveExternalProjectAdminMapping(config, site.origin)).toEqual(
      site
    );
    expect(resolveExternalProjectAdminMapping(config, docs.origin)).toEqual(
      docs
    );
  });
});
