import { describe, expect, it } from 'vitest';
import { isTopicAnnouncementsModuleEnabled } from './topic-announcements-module';

describe('isTopicAnnouncementsModuleEnabled', () => {
  it('matches the topic API rule exactly', () => {
    expect(isTopicAnnouncementsModuleEnabled('true')).toBe(true);
    for (const value of [
      'TRUE',
      ' true',
      'True',
      'false',
      '',
      null,
      undefined,
    ]) {
      expect(isTopicAnnouncementsModuleEnabled(value)).toBe(false);
    }
  });
});
