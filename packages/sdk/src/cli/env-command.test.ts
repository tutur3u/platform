import { describe, expect, it } from 'vitest';
import type { CliConfig } from './config';
import { runEnvCommand } from './env-command';

describe('ttr env', () => {
  it('prints current resolved env and switches defaultEnv cleanly', async () => {
    let saved: CliConfig = { baseUrl: 'https://tuturuuu.com' };
    let out = '';

    await runEnvCommand(['current', '--json'], {
      envVars: {},
      readConfig: async () => saved,
      write: (c) => {
        out += c;
      },
      writeConfig: async (next) => {
        saved = next;
      },
    });
    expect(JSON.parse(out).activeEnv).toBe('staging');

    let previewOut = '';
    await runEnvCommand(['use', 'prod', '--json'], {
      envVars: {},
      readConfig: async () => saved,
      write: (c) => {
        previewOut += c;
      },
      writeConfig: async (next) => {
        saved = next;
      },
    });
    expect(JSON.parse(previewOut).applied).toBe(false);
    expect(saved.defaultEnv).toBeUndefined();

    let useOut = '';
    await runEnvCommand(['use', 'prod', '--yes', '--json'], {
      envVars: {},
      readConfig: async () => saved,
      write: (c) => {
        useOut += c;
      },
      writeConfig: async (next) => {
        saved = next;
      },
    });
    expect(JSON.parse(useOut)).toEqual({ defaultEnv: 'prod', ok: true });
    expect(saved.defaultEnv).toBe('prod');
  });
});
