import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkCredentialIsolation,
  type DevboxIsolationProbes,
  evaluateDevboxIsolation,
} from './devbox-isolation';

const home = '/home/dev';
const checkout = '/srv/platform';
const tokenFile = '/private/runner/token.env';
const envFile = `${checkout}/apps/web/.env.local`;
const cleanAcl = 'user::rwx\ngroup::---\nother::---\n';
const grant = 'user::rwx\nuser:990:r-x\ngroup::---\nmask::r-x\nother::---\n';
const macHeader = 'drwx------  2 dev staff 64 Oct 23 00:00 path\n';

async function check(
  platform: string,
  target: string,
  output: string,
  code = 0
) {
  const inspected: string[] = [];
  const probes: Partial<DevboxIsolationProbes> = {
    platform,
    stat: async (path) => ({
      uid: 1000,
      gid: 1000,
      mode: path.endsWith('.env') || path === envFile ? 0o100600 : 0o040700,
    }),
    realpath: async (path) => path,
    readdir: async (path) =>
      path === checkout
        ? ['apps']
        : path === `${checkout}/apps`
          ? ['web']
          : path === `${checkout}/apps/web`
            ? ['.env.local']
            : [],
    run: async (command, args) => {
      if (command === 'id')
        return { code: 0, stdout: args[0] === '-Gn' ? 'judge\n' : '990\n' };
      const path = args.at(-1) ?? '';
      inspected.push(path);
      return path === target
        ? { code, stdout: output }
        : { code: 0, stdout: platform === 'linux' ? cleanAcl : macHeader };
    },
  };
  const findings = await checkCredentialIsolation({
    tokenFile,
    otherUser: 'judge',
    home,
    checkoutDir: checkout,
    probes,
  });
  return {
    findings,
    inspected,
    verdict: evaluateDevboxIsolation(
      findings,
      'trusted',
      findings.map((entry) => entry.check)
    ),
  };
}

const targets = [
  [home, 'homeDirectoryAcl'],
  [checkout, 'checkoutDirectoryAcl'],
  [envFile, 'checkoutEnvFilesAcl'],
  ['/srv', 'checkoutDirectoryAcl'],
  [`${checkout}/apps`, 'checkoutEnvFilesAcl'],
  ['/private', 'credentialFileAcl'],
] as const;

describe('REV-6451-2 ACL evidence across protected paths and ancestors', () => {
  it.skipIf(process.platform !== 'darwin')(
    'detects a real macOS ACL grant behind private mode bits',
    async () => {
      const root = await mkdtemp(join(tmpdir(), 'ttr-acl-regression-'));
      try {
        const privateHome = join(root, 'home');
        await mkdir(privateHome, { mode: 0o700 });
        const token = join(root, 'token.env');
        await writeFile(token, 'fixture', { mode: 0o600 });
        execFileSync('chmod', [
          '+a',
          'user:nobody allow read,search',
          privateHome,
        ]);
        expect((await stat(privateHome)).mode & 0o777).toBe(0o700);
        const findings = await checkCredentialIsolation({
          tokenFile: token,
          otherUser: 'nobody',
          home: privateHome,
        });
        expect(
          findings.find((entry) => entry.check === 'homeDirectoryAcl')?.status
        ).toBe('fail');
        expect(
          evaluateDevboxIsolation(
            findings,
            'trusted',
            findings.map((entry) => entry.check)
          ).ok
        ).toBe(false);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    }
  );

  it.each(targets)('rejects a Linux ACL grant at %s', async (path, label) => {
    const { findings, inspected, verdict } = await check('linux', path, grant);
    expect(inspected).toContain(path);
    expect(findings.find((entry) => entry.check === label)?.status).toBe(
      'fail'
    );
    expect(verdict.ok).toBe(false);
  });

  it.each(targets)('rejects a macOS allow ACL at %s', async (path, label) => {
    const { findings, inspected, verdict } = await check(
      'darwin',
      path,
      `${macHeader} 0: user:judge allow read,search\n`
    );
    expect(inspected).toContain(path);
    expect(findings.find((entry) => entry.check === label)?.status).toBe(
      'fail'
    );
    expect(verdict.ok).toBe(false);
  });

  it.each(['linux', 'darwin'])(
    'fails required evidence when %s ACL tooling is unavailable',
    async (platform) => {
      const { findings, verdict } = await check(platform, home, '', 127);
      expect(
        findings.find((entry) => entry.check === 'homeDirectoryAcl')?.status
      ).toBe('unknown');
      expect(verdict.missing).toContain('homeDirectoryAcl');
      expect(verdict.ok).toBe(false);
    }
  );

  it.each(['', 'not ACL data', 'user::rwx\ngroup::---\n'])(
    'treats incomplete Linux output as unknown (%j)',
    async (output) => {
      const { findings } = await check('linux', checkout, output);
      expect(
        findings.find((entry) => entry.check === 'checkoutDirectoryAcl')?.status
      ).toBe('unknown');
    }
  );

  it.each([
    '',
    'not ACL data',
    `${macHeader}unparsed ACL\n`,
    macHeader.replace('  2', '+ 2'),
  ])('treats indeterminate macOS output as unknown (%j)', async (output) => {
    const { findings } = await check('darwin', checkout, output);
    expect(
      findings.find((entry) => entry.check === 'checkoutDirectoryAcl')?.status
    ).toBe('unknown');
  });

  it('applies the Linux ACL mask instead of treating a masked entry as effective', async () => {
    const { findings } = await check(
      'linux',
      home,
      grant.replace('mask::r-x', 'mask::---')
    );
    expect(findings.every((entry) => entry.status === 'pass')).toBe(true);
  });

  it.each(['linux', 'darwin'])(
    'passes fully inspected private paths on %s',
    async (platform) => {
      const { findings, inspected } = await check(platform, '', '');
      expect(findings.every((entry) => entry.status === 'pass')).toBe(true);
      for (const [path] of targets) expect(inspected).toContain(path);
      expect(inspected).toContain('/');
    }
  );
});
