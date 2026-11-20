import { type FlagValue, getFlag } from './args';
import {
  type CliConfig,
  clearHostScopedConfig,
  DEFAULT_BASE_URL,
  getDefaultConfigPath,
  normalizeHostBaseUrl,
  resolveCliHostBaseUrl,
  writeCliConfig,
} from './config';
import { render } from './render';

/** `ttr host current|list|use`: switch the API host the CLI talks to. */
function getHostSwitchPort(flags: Record<string, FlagValue>) {
  return getFlag(flags, 'port');
}

export async function runHostCommand({
  action,
  config,
  firstId,
  flags,
  json,
}: {
  action?: string;
  config: CliConfig;
  firstId?: string;
  flags: Record<string, FlagValue>;
  json: boolean;
}) {
  if (action === 'current' || !action) {
    render(
      {
        baseUrl: config.baseUrl,
        configPath: getDefaultConfigPath(),
      },
      { group: 'host', json }
    );
    return;
  }

  if (action === 'list') {
    const localBaseUrl = resolveCliHostBaseUrl('local', {
      env: process.env,
      port: getHostSwitchPort(flags),
      portless: flags.portless === true,
    });

    render(
      [
        {
          alias: 'production',
          baseUrl: DEFAULT_BASE_URL,
          current: normalizeHostBaseUrl(config.baseUrl) === DEFAULT_BASE_URL,
        },
        {
          alias: 'local',
          baseUrl: localBaseUrl,
          current: normalizeHostBaseUrl(config.baseUrl) === localBaseUrl,
        },
      ],
      { group: 'host', json }
    );
    return;
  }

  if (action === 'use') {
    if (!firstId) {
      throw new Error(
        'Missing host target. Use production, prod, local, localhost, or a URL.'
      );
    }

    const nextBaseUrl = resolveCliHostBaseUrl(firstId, {
      env: process.env,
      port: getHostSwitchPort(flags),
      portless: flags.portless === true,
    });
    const nextConfig = clearHostScopedConfig(config, nextBaseUrl);
    const changed =
      normalizeHostBaseUrl(config.baseUrl) !==
      normalizeHostBaseUrl(nextBaseUrl);
    await writeCliConfig(nextConfig);

    if (json) {
      render(
        {
          baseUrl: nextConfig.baseUrl,
          changed,
          contextCleared: changed,
        },
        { group: 'host', json }
      );
      return;
    }

    process.stdout.write(
      `${[
        `Host set to ${nextConfig.baseUrl}`,
        changed
          ? 'Saved session and selected workspace context were cleared.'
          : null,
      ]
        .filter(Boolean)
        .join('\n')}\n`
    );
    return;
  }

  throw new Error(`Unknown host action: ${action}`);
}
