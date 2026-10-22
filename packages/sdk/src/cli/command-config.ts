import packageJson from '../../package.json';
import { type FlagValue, getFlag } from './args';
import { readCliConfig, writeCliConfig } from './config';
import { checkForCliUpdate, isCliUpdateCheckDisabled } from './update';

export async function readCommandConfig(flags: Record<string, FlagValue>) {
  let config = await readCliConfig();
  if (flags['no-update-check'] !== true && !isCliUpdateCheckDisabled()) {
    const nextConfig = await checkForCliUpdate({
      config,
      currentVersion: packageJson.version,
      quiet:
        flags.json === true ||
        getFlag(flags, 'format')?.toLowerCase() === 'json' ||
        ['json', 'bytes-json'].includes(
          getFlag(flags, 'output')?.toLowerCase() ?? ''
        ),
    });
    if (nextConfig !== config) {
      await writeCliConfig(nextConfig);
      config = nextConfig;
    }
  }
  return config;
}
