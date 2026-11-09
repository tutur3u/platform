import { describe, expect, it } from 'vitest';
import { describeMailError, MailSendError } from './send-error';

describe('describeMailError', () => {
  it('uses an Error message', () => {
    expect(describeMailError(new Error('token lacks permission'))).toBe(
      'token lacks permission'
    );
  });

  it('keeps a thrown string', () => {
    expect(describeMailError('boom')).toBe('boom');
  });

  it('serializes a thrown plain object instead of hiding it', () => {
    expect(describeMailError({ code: 10000 })).toBe('{"code":10000}');
  });

  it('keeps the cause on MailSendError', () => {
    const cause = new Error('inner');
    expect(new MailSendError('outer', { cause }).cause).toBe(cause);
  });
});
