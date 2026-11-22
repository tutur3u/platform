import { InternalApiError } from '@tuturuuu/internal-api';
import { describe, expect, it } from 'vitest';
import {
  type DriveBrowserInput,
  resolveDriveBrowserState,
} from './drive-browser-state';
import { getDriveFileKind } from './drive-file-kind';

const folder = { name: 'Logos' };
const image = { id: '1', name: 'a-hero.png', metadata: { size: 10 } };
const pdf = { id: '2', name: 'b-guide.pdf', metadata: { size: 20 } };

const input = (overrides: Partial<DriveBrowserInput>): DriveBrowserInput => ({
  access: 'manage',
  error: null,
  items: [],
  path: '',
  query: '',
  status: 'success',
  type: null,
  ...overrides,
});

describe('resolveDriveBrowserState', () => {
  it('denies without manage_drive or on a 403 from the list endpoint', () => {
    expect(resolveDriveBrowserState(input({ access: 'denied' })).kind).toBe(
      'denied'
    );
    expect(
      resolveDriveBrowserState(
        input({
          error: new InternalApiError('Forbidden', 403),
          items: undefined,
          status: 'error',
        })
      ).kind
    ).toBe('denied');
  });

  it('separates loading, error and stale data during a failed refetch', () => {
    expect(
      resolveDriveBrowserState(input({ items: undefined, status: 'pending' }))
        .kind
    ).toBe('loading');
    expect(
      resolveDriveBrowserState(
        input({ error: new Error('x'), items: undefined, status: 'error' })
      ).kind
    ).toBe('error');
    expect(
      resolveDriveBrowserState(
        input({ error: new Error('x'), items: [image], status: 'error' })
      ).kind
    ).toBe('ready');
  });

  it('distinguishes an empty root, an empty folder and no results', () => {
    expect(resolveDriveBrowserState(input({})).kind).toBe('empty-root');
    expect(resolveDriveBrowserState(input({ path: 'a' })).kind).toBe(
      'empty-folder'
    );
    expect(resolveDriveBrowserState(input({ query: ' x ' }))).toEqual({
      kind: 'no-results',
      query: 'x',
      type: null,
    });
    expect(
      resolveDriveBrowserState(input({ items: [image], type: 'pdf' }))
    ).toEqual({ kind: 'no-results', query: '', type: 'pdf' });
  });

  it('splits folders from files and filters loaded files by type', () => {
    expect(
      resolveDriveBrowserState(
        input({ items: [folder, image, pdf], type: 'image' })
      )
    ).toEqual({
      kind: 'ready',
      folders: [folder],
      files: [image],
      hiddenByType: 1,
    });
  });
});

describe('getDriveFileKind', () => {
  it('prefers the MIME type and falls back to the extension', () => {
    expect(
      getDriveFileKind({ name: 'scan', metadata: { mimetype: 'image/png' } })
    ).toBe('image');
    expect(getDriveFileKind({ name: 'q4.XLSX' })).toBe('sheet');
    expect(getDriveFileKind({ name: 'fonts.zip' })).toBe('archive');
    expect(getDriveFileKind({ name: 'README' })).toBe('other');
  });
});
