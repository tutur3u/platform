import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSnsVerification } from './sns-startup.ts';

test('production Mail refuses the SNS verification bypass in bindings or runtime env', (t) => {
  const mode = process.env.NODE_ENV;
  const verification = process.env.MAIL_SES_SNS_SIGNATURE_VERIFICATION;
  t.after(() => {
    if (mode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = mode;
    if (verification === undefined)
      delete process.env.MAIL_SES_SNS_SIGNATURE_VERIFICATION;
    else process.env.MAIL_SES_SNS_SIGNATURE_VERIFICATION = verification;
  });
  process.env.NODE_ENV = 'production';
  delete process.env.MAIL_SES_SNS_SIGNATURE_VERIFICATION;
  assert.throws(
    () =>
      assertSnsVerification({
        MAIL_SES_SNS_SIGNATURE_VERIFICATION: 'disabled',
      }),
    /must not be disabled/
  );
  assert.doesNotThrow(() => assertSnsVerification({}));
  process.env.MAIL_SES_SNS_SIGNATURE_VERIFICATION = 'disabled';
  assert.throws(() => assertSnsVerification({}), /must not be disabled/);
  process.env.NODE_ENV = 'development';
  assert.doesNotThrow(() => assertSnsVerification({}));
});
