import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { challengePasswordErrorKey } from './challenge-password-error';

it.each([
  ['en', 'must be reset'],
  ['vi', 'phải được đặt lại'],
])(
  'shows the actual %s reset copy instead of a wrong-password outcome',
  async (locale, fragment) => {
    const response = new Response(
      JSON.stringify({ code: 'PASSWORD_RESET_REQUIRED' }),
      { status: 409 }
    );
    const key = await challengePasswordErrorKey(response);
    const messages = JSON.parse(
      readFileSync(resolve(process.cwd(), 'messages', `${locale}.json`), 'utf8')
    );
    expect(key).toBe('challenge_password_reset_required');
    expect(messages.nova[key]).toContain(fragment);
    expect(messages.nova[key]).not.toBe(
      messages.nova.challenge_password_invalid
    );
  }
);

it('retains the wrong-password outcome for an ordinary rejection', async () => {
  expect(
    await challengePasswordErrorKey(new Response(null, { status: 401 }))
  ).toBe('challenge_password_invalid');
});
