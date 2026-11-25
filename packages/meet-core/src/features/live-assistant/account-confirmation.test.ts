import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import en from '../../../../../apps/meet/messages/en.json';
import vi from '../../../../../apps/meet/messages/vi.json';
import {
  isMiraAccountConfirmed,
  MIRA_ACCOUNT_CONFIRMATION_VERSION,
} from './account-confirmation';

it('binds the account confirmation version to the English and Vietnamese text', () => {
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  expect({
    version: MIRA_ACCOUNT_CONFIRMATION_VERSION,
    en: hash(en.meet.mira_consent.account_statement),
    vi: hash(vi.meet.mira_consent.account_statement),
  }).toEqual({
    version: '2026-11-25-v1',
    en: '483b32215d3a38f382d0affa8e9a6cb21772ccb524f7c878d1a61aea7243dc3d',
    vi: '3a43d3691dcc721785bff9132cec51e2ea5716931a1a32a3daea03489398d69a',
  });
});

it('accepts the legacy version and a complete current marker', () => {
  const marker = {
    version: MIRA_ACCOUNT_CONFIRMATION_VERSION,
    confirmedAt: '2026-11-25T12:00:00.000Z',
    locale: 'vi',
    textHash: 'a'.repeat(64),
  };
  expect(isMiraAccountConfirmed(MIRA_ACCOUNT_CONFIRMATION_VERSION)).toBe(true);
  expect(isMiraAccountConfirmed(marker)).toBe(true);
  expect(isMiraAccountConfirmed({ ...marker, version: 'obsolete' })).toBe(false);
  expect(isMiraAccountConfirmed({ ...marker, confirmedAt: '' })).toBe(false);
});
