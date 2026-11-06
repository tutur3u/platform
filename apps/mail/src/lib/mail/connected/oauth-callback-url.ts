import {
  ConnectedMailError,
  type MailProvider,
  providerConfig,
} from './config';

const callbackPath = '/api/v1/mail/connected/callback';

function parseCallback(value: string) {
  const url = new URL(value);
  const basePath = url.pathname === `/mail${callbackPath}` ? '/mail' : '';
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== `${basePath}${callbackPath}` ||
    (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))
  )
    throw new Error('Invalid Mail OAuth callback configuration');
  return {
    url,
    redirectUri: value,
    basePath,
    cookiePath: `${basePath}/api/v1/mail/connected`,
  };
}

export function resolveOAuthCallback(
  provider: MailProvider,
  requestUrl: string
) {
  const prefix = provider === 'google' ? 'GOOGLE' : 'MICROSOFT';
  const primary = providerConfig(provider).redirectUri;
  const apex = process.env[`MAIL_${prefix}_APEX_REDIRECT_URI`];
  const callbacks = [primary, ...(apex ? [apex] : [])].map(parseCallback);
  const request = new URL(requestUrl);
  const basePath =
    request.pathname === '/mail' || request.pathname.startsWith('/mail/')
      ? '/mail'
      : '';
  const callback = callbacks.find(
    (candidate) =>
      candidate.url.origin === request.origin && candidate.basePath === basePath
  );
  if (!callback)
    throw new ConnectedMailError(
      400,
      'Mail authorization host is not registered'
    );
  return {
    redirectUri: callback.redirectUri,
    basePath: callback.basePath,
    cookiePath: callback.cookiePath,
  };
}
