import { describe, expect, it } from 'vitest';
import {
  FORM_STUDIO_CHANNEL_PREFIX,
  getFormStudioChannelName,
} from './channel';

describe('getFormStudioChannelName', () => {
  it('produces the topic shape the RLS policy parses', () => {
    // `private.can_join_form_realtime_topic` strips this exact prefix and casts
    // the remainder to uuid. If the two ever disagree, every channel join is
    // denied with no clue why — so the contract is asserted here.
    const formId = '9f1c0a52-1f4c-4a3f-9a4e-0d3b4c5d6e7f';

    expect(getFormStudioChannelName(formId)).toBe(`form-studio-${formId}`);
    expect(
      getFormStudioChannelName(formId).slice(FORM_STUDIO_CHANNEL_PREFIX.length)
    ).toBe(formId);
  });
});
