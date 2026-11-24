import { describe, expect, it } from 'vitest';
import {
  optionalDefaultOn,
  resolvePrivacyRegion,
} from './privacy-consent-region';

const resolve = (
  timeZone: string | null,
  languages: string[] = ['en-US'],
  locale = 'en'
) => resolvePrivacyRegion({ timeZone, languages, locale });

describe('resolvePrivacyRegion', () => {
  it('pre-selects optional categories outside restricted regions', () => {
    expect(resolve('America/New_York')).toBe('default-on');
    expect(resolve('Asia/Singapore')).toBe('default-on');
    expect(optionalDefaultOn(resolve('Asia/Tokyo', ['ja-JP']))).toBe(true);
  });

  it('starts off for EU, EEA, UK and Swiss time zones', () => {
    for (const zone of [
      'Europe/Berlin',
      'Europe/London',
      'Europe/Zurich',
      'Atlantic/Canary',
      'Atlantic/Reykjavik',
      'Asia/Nicosia',
    ]) {
      expect(resolve(zone)).toBe('restricted');
    }
  });

  it('starts off for Vietnam by time zone, browser language or route locale', () => {
    expect(resolve('Asia/Ho_Chi_Minh')).toBe('restricted');
    expect(resolve('Asia/Saigon')).toBe('restricted');
    expect(resolve('America/Los_Angeles', ['vi-VN', 'en-US'])).toBe(
      'restricted'
    );
    expect(resolve('Asia/Singapore', ['en-US'], 'vi')).toBe('restricted');
    expect(resolve('Asia/Singapore', ['vie'])).toBe('default-on');
  });

  it('starts off for EU outermost regions and UTC-reporting browsers', () => {
    for (const zone of [
      'America/Guadeloupe',
      'America/Martinique',
      'America/Cayenne',
      'Indian/Reunion',
      'Indian/Mayotte',
      'Africa/Ceuta',
      'UTC',
      'Etc/UTC',
      'Etc/GMT',
      'GMT',
    ]) {
      expect(resolve(zone)).toBe('restricted');
    }
  });

  it('fails closed when the time zone is unknown', () => {
    expect(resolve(null)).toBe('restricted');
    expect(resolve('')).toBe('restricted');
    expect(optionalDefaultOn('restricted')).toBe(false);
  });
});
