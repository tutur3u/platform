export type AuthMethod =
  | 'pwd'
  | 'otp'
  | 'totp'
  | 'passkey'
  | 'oauth'
  | 'sso'
  | 'device_approval'
  | 'qr';

export const AUTH_METHODS: readonly AuthMethod[] = Object.freeze([
  'pwd',
  'otp',
  'totp',
  'passkey',
  'oauth',
  'sso',
  'device_approval',
  'qr',
]);
