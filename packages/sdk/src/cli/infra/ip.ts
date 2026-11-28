import { isIP } from 'node:net';
import { getInfrastructureOrigin } from '../../platform-devbox-fleet';
import { getClient } from '../account-group';
import { CLI_EXIT, CliError } from '../cli-contracts';
import { resolveTuturuuuOrigins } from '../cli-env';
import { readCliConfig } from '../config';

export async function runIpOperator(
  [family, action, ip, ...rest]: string[],
  flags: Map<string, string | true>,
  write: (chunk: string) => void
) {
  const usage = () =>
    new CliError({
      code: 'INVALID_IP_OPERATOR_USAGE',
      message: 'Run ttr infra --help for IP operator usage.',
    });
  const path = '/api/v1/infrastructure/blocked-ips';
  const params = new URLSearchParams();
  const writeAction = action === 'block' || action === 'unblock';
  const isStatus = family === 'ratelimit' && action === 'status';
  const needsIp = writeAction || action === 'inspect';
  const allowed = new Set(['json', 'no-color']);
  if (action === 'list') allowed.add('ip');
  if (writeAction) allowed.add('reason');
  if (action === 'block') allowed.add('ttl');
  if (
    (!isStatus &&
      !['list', 'inspect', 'whoami', 'block', 'unblock'].includes(
        action ?? ''
      )) ||
    (family !== 'ip' && !isStatus) ||
    (needsIp ? !ip || !isIP(ip) || ip.includes('%') : ip !== undefined) ||
    rest.length ||
    [...flags.keys()].some((flag) => !allowed.has(flag))
  )
    throw usage();

  const address = ip ?? flags.get('ip');
  if (
    address !== undefined &&
    (typeof address !== 'string' || !isIP(address) || address.includes('%'))
  )
    throw usage();
  if (address !== undefined) params.set('ip', address);

  const reasonFlag = flags.get('reason');
  const reason = typeof reasonFlag === 'string' ? reasonFlag.trim() : '';
  const ttl = Number(flags.get('ttl'));
  if (writeAction && !reason) throw usage();
  if (
    action === 'block' &&
    (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > 2592000)
  )
    throw usage();

  const config = await readCliConfig();
  if (
    !config.session?.accessToken ||
    !config.session.refreshToken ||
    (config.session.refreshExpiresAt &&
      config.session.refreshExpiresAt * 1000 <= Date.now())
  )
    throw new CliError({
      code: 'IP_OPERATOR_SIGN_IN_REQUIRED',
      message: 'Run ttr login and retry.',
      exitCode: CLI_EXIT.auth,
    });
  const configured = new URL(config.baseUrl);
  const hosted = configured.hostname === 'tuturuuu.com';
  const stagingHost = ['web.tutur3u.com', 'sandbox.web.tutur3u.com'].includes(
    configured.hostname
  );
  const origin = hosted
    ? 'https://tuturuuu.com'
    : stagingHost
      ? resolveTuturuuuOrigins(
          configured.hostname.startsWith('sandbox.') ? 'sandbox' : 'staging'
        ).admin
      : getInfrastructureOrigin(config.baseUrl);
  const target = new URL(origin);
  if (
    target.protocol !== 'https:' &&
    !['localhost', '127.0.0.1', '[::1]', 'infra.tuturuuu.localhost'].includes(
      target.hostname
    )
  )
    throw usage();

  const { fetch: send } = getClient(config).getClientOptions(origin);
  params.set(
    'mode',
    isStatus ? 'ratelimit' : writeAction ? 'list' : (action ?? 'list')
  );
  let response: Response;
  try {
    response = await (send ?? fetch)(
      new URL(`${hosted ? '/admin' : ''}${path}?${params}`, origin),
      {
        method: writeAction ? (action === 'block' ? 'POST' : 'DELETE') : 'GET',
        redirect: 'error',
        ...(writeAction
          ? {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ip_address: ip,
                reason,
                ttl: action === 'block' ? ttl : undefined,
              }),
            }
          : {}),
      }
    );
  } catch (error) {
    if (
      error instanceof Error &&
      /^CLI session refresh failed: (?:400|401|403)$/u.test(error.message)
    )
      throw new CliError({
        code: 'IP_OPERATOR_SIGN_IN_REQUIRED',
        message: 'Run ttr login and retry.',
        exitCode: CLI_EXIT.auth,
      });
    throw new CliError({
      code: 'IP_OPERATOR_UNAVAILABLE',
      message:
        'Infrastructure request failed. Inspect current state before retrying a mutation.',
      exitCode: CLI_EXIT.unavailable,
    });
  }
  if (!response.ok) {
    const forbidden = response.status === 401 || response.status === 403;
    const notFound = response.status === 404;
    throw new CliError({
      code: forbidden
        ? 'IP_OPERATOR_FORBIDDEN'
        : notFound
          ? 'IP_OPERATOR_NOT_FOUND'
          : 'IP_OPERATOR_FAILED',
      message: forbidden
        ? 'Staff permission or recent MFA required. Sign in again if needed.'
        : notFound
          ? 'IP block not found.'
          : `Infrastructure request failed (HTTP ${response.status}). Inspect state before retrying a mutation.`,
      exitCode: forbidden
        ? CLI_EXIT.auth
        : notFound || response.status === 409
          ? 2
          : CLI_EXIT.unavailable,
    });
  }
  const result: unknown = await response.json();
  write(`${JSON.stringify(result, null, flags.has('json') ? undefined : 2)}\n`);
}
