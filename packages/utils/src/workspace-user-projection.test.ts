import { describe, expect, it } from 'vitest';
import { projectWorkspaceUser } from './workspace-user-projection';

const profile = {
  id: 'profile-1',
  ws_id: 'workspace-1',
  full_name: 'Synthetic Person',
  email: 'synthetic@example.invalid',
  national_id: 'synthetic-id',
  avatar_url: '/synthetic.png',
  future_private_field: 'synthetic',
};

describe('workspace user projection', () => {
  it('allows only identity without read permissions', () => {
    expect(
      projectWorkspaceUser(profile, { publicInfo: false, privateInfo: false })
    ).toEqual({ id: 'profile-1', ws_id: 'workspace-1' });
  });
  it('public access omits private and unclassified fields', () => {
    expect(
      projectWorkspaceUser(profile, { publicInfo: true, privateInfo: false })
    ).toEqual({
      id: 'profile-1',
      ws_id: 'workspace-1',
      full_name: 'Synthetic Person',
      avatar_url: '/synthetic.png',
    });
  });
  it('private access omits public and unclassified fields', () => {
    expect(
      projectWorkspaceUser(profile, { publicInfo: false, privateInfo: true })
    ).toEqual({
      id: 'profile-1',
      ws_id: 'workspace-1',
      email: 'synthetic@example.invalid',
      national_id: 'synthetic-id',
    });
  });
  it('combined access still excludes unclassified fields and preserves input', () => {
    const projected = projectWorkspaceUser(profile, {
      publicInfo: true,
      privateInfo: true,
    });
    expect(projected).not.toHaveProperty('future_private_field');
    expect(projected).toHaveProperty('national_id', 'synthetic-id');
    expect(projected).toHaveProperty('full_name', 'Synthetic Person');
    expect(profile).toHaveProperty('future_private_field', 'synthetic');
  });
});
