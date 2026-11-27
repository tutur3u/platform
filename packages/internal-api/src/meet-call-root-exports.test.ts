import { describe, expect, it } from 'vitest';
import * as internalApi from './index';

// Meet chat file and Meet assistant helpers are consumed through the package
// root by meet-core (chat panel, Q&A composer and answers). Lock the root export
// so a dropped star re-export fails here instead of at runtime in the browser.
const MEET_CALL_ROOT_EXPORTS = [
  'askMeetAssistant',
  'discardMeetChatFile',
  'draftMeetLiveActivity',
  'listMeetAssistantReviews',
  'readMeetChatFile',
  'uploadMeetChatFile',
] as const;

describe('internal-api root exports meet-call helpers', () => {
  it.each(MEET_CALL_ROOT_EXPORTS)(
    'exposes %s from the package root',
    (name) => {
      expect(typeof internalApi[name]).toBe('function');
    }
  );
});
