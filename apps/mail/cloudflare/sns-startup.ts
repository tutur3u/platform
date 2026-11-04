export function assertSnsVerification(env: object) {
  if (
    process.env.NODE_ENV === 'production' &&
    (Reflect.get(env, 'MAIL_SES_SNS_SIGNATURE_VERIFICATION') === 'disabled' ||
      process.env.MAIL_SES_SNS_SIGNATURE_VERIFICATION === 'disabled')
  )
    throw new Error(
      'SNS signature verification must not be disabled in production'
    );
}
