import { describe, expect, it } from 'vitest';
import {
  describeMailError,
  MailSendError,
  MAIL_SEND_PUBLIC_MESSAGE,
} from './send-error';

describe('public mail errors', () => {
  it.each([
    new Error('canary credential'),
    'canary credential',
    { token: 'canary credential' },
  ])('does not expose internal details', (error) => {
    expect(describeMailError(error)).toBe(MAIL_SEND_PUBLIC_MESSAGE);
    expect(
      new MailSendError('canary credential', { cause: error }).message
    ).toBe(MAIL_SEND_PUBLIC_MESSAGE);
  });
});
