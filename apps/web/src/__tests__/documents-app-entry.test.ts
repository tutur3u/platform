import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { describe, expect, it } from 'vitest';
import {
  getDocumentsAppEntryTarget,
  getDocumentsAppLoginTarget,
} from '@/lib/documents-app-entry';

describe('documents app entry', () => {
  it('opens Documents in the personal workspace slug', () => {
    expect(getDocumentsAppEntryTarget({ id: 'abc', personal: true })).toBe(
      '/personal/documents'
    );
  });

  it('uses the internal slug for the root workspace and ids otherwise', () => {
    expect(getDocumentsAppEntryTarget({ id: ROOT_WORKSPACE_ID })).toBe(
      '/internal/documents'
    );
    expect(getDocumentsAppEntryTarget({ id: 'ws-1', personal: false })).toBe(
      '/ws-1/documents'
    );
  });

  it('falls back to personal and keeps non-default locales', () => {
    expect(getDocumentsAppEntryTarget(null, 'vi')).toBe(
      '/vi/personal/documents'
    );
    expect(getDocumentsAppEntryTarget(null, 'en')).toBe('/personal/documents');
    expect(getDocumentsAppEntryTarget(null, 'xx')).toBe('/personal/documents');
  });

  it('returns signed-out visitors to /docs after login', () => {
    expect(getDocumentsAppLoginTarget('en')).toBe('/login?nextUrl=%2Fdocs');
    expect(getDocumentsAppLoginTarget('vi')).toBe(
      '/login?nextUrl=%2Fvi%2Fdocs'
    );
  });
});
