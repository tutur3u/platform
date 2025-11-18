export const EMAIL_BLACKLIST_REGEX =
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export const DOMAIN_BLACKLIST_REGEX =
  /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export const isValidBlacklistEmail = (value: string): boolean =>
  EMAIL_BLACKLIST_REGEX.test(value);

export const isValidBlacklistDomain = (value: string): boolean =>
  DOMAIN_BLACKLIST_REGEX.test(value);
