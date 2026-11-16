import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { describe, expect, it } from 'vitest';
import {
  orderedPickerRows,
  partitionWorkspaces,
} from '../workspace-picker/partition';

function ws(
  id: string,
  name: string,
  extra: Partial<InternalApiWorkspaceSummary> = {}
): InternalApiWorkspaceSummary {
  return {
    id,
    name,
    personal: false,
    avatar_url: null,
    logo_url: null,
    tier: 'FREE',
    ...extra,
  };
}

const personal = ws('own', 'Personal', { personal: true });
const internal = ws(ROOT_WORKSPACE_ID, 'Platform', { tier: 'ENTERPRISE' });
const alpha = ws('alpha', 'Alpha studio', { tier: 'PRO' });
const beta = ws('beta', 'Beta lab');
const gamma = ws('gamma', 'Gamma hall', { tier: 'PLUS' });
const guestPersonal = ws('guest-own', 'Shared notebook', {
  personal: true,
  access_type: 'guest',
});

function ids(list: InternalApiWorkspaceSummary[]) {
  return list.map((workspace) => workspace.id);
}

function partition(
  overrides: Partial<Parameters<typeof partitionWorkspaces>[0]> = {}
) {
  return partitionWorkspaces({
    workspaces: [gamma, beta, internal, alpha, personal],
    hiddenIds: [],
    pinnedIds: [],
    recentIds: [],
    query: '',
    ...overrides,
  });
}

describe('partitionWorkspaces', () => {
  it('puts Personal first and Internal next, whatever the input order', () => {
    const result = partition();
    expect(ids(orderedPickerRows(result, false))).toEqual([
      'own',
      ROOT_WORKSPACE_ID,
      'alpha',
      'beta',
      'gamma',
    ]);
    expect(ids(result.personal)).toEqual(['own']);
    expect(ids(result.internal)).toEqual([ROOT_WORKSPACE_ID]);
  });

  it('never repeats Personal or Internal in Pinned or Recent', () => {
    const result = partition({
      pinnedIds: ['own', ROOT_WORKSPACE_ID, 'gamma'],
      recentIds: [ROOT_WORKSPACE_ID, 'own', 'beta', 'gamma'],
    });
    expect(ids(result.pinned)).toEqual(['gamma']);
    expect(ids(result.recent)).toEqual(['beta']);
    expect(ids(result.rest)).toEqual(['alpha']);
    const all = ids(orderedPickerRows(result, true));
    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(5);
  });

  it('keeps pin order, recent order and an alphabetical remainder', () => {
    const result = partition({
      pinnedIds: ['gamma', 'alpha'],
      recentIds: ['alpha', 'beta'],
    });
    expect(ids(result.pinned)).toEqual(['gamma', 'alpha']);
    expect(ids(result.recent)).toEqual(['beta']);
    expect(result.rest).toEqual([]);
  });

  it('places each workspace once even when the input repeats ids', () => {
    const result = partition({
      workspaces: [alpha, alpha, personal, personal, beta],
      pinnedIds: ['alpha', 'alpha'],
      recentIds: ['beta', 'beta'],
    });
    expect(ids(orderedPickerRows(result, true))).toEqual([
      'own',
      'alpha',
      'beta',
    ]);
  });

  it('moves hidden workspaces, including Personal and Internal, to Hidden only', () => {
    const result = partition({
      hiddenIds: ['own', ROOT_WORKSPACE_ID, 'gamma'],
      pinnedIds: ['gamma'],
      recentIds: ['gamma'],
    });
    expect(result.personal).toEqual([]);
    expect(result.internal).toEqual([]);
    expect(result.pinned).toEqual([]);
    expect(result.recent).toEqual([]);
    expect(ids(result.hidden)).toEqual(['gamma', 'own', ROOT_WORKSPACE_ID]);
    expect(ids(orderedPickerRows(result, false))).toEqual(['alpha', 'beta']);
    expect(ids(orderedPickerRows(result, true)).slice(-3)).toEqual([
      'gamma',
      'own',
      ROOT_WORKSPACE_ID,
    ]);
  });

  it('treats guest access to a personal workspace as an ordinary workspace', () => {
    const result = partition({
      workspaces: [guestPersonal, personal],
      pinnedIds: ['guest-own'],
    });
    expect(ids(result.personal)).toEqual(['own']);
    expect(ids(result.pinned)).toEqual(['guest-own']);
  });

  it('filters every section by name, id and plan', () => {
    expect(ids(orderedPickerRows(partition({ query: 'plat' }), false))).toEqual(
      [ROOT_WORKSPACE_ID]
    );
    expect(ids(orderedPickerRows(partition({ query: 'pro' }), false))).toEqual([
      'alpha',
    ]);
    expect(
      ids(
        orderedPickerRows(
          partition({ query: 'gam', hiddenIds: ['gamma'] }),
          true
        )
      )
    ).toEqual(['gamma']);
  });
});
