import { describe, expect, it, vi } from 'vitest';
import {
  parseDevboxExecutionMode,
  preflightProtectedService,
  protectedSystemdSettings,
} from './devbox-host-protection';
import { renderSystemdUnit } from './devbox-setup-service-templates';

vi.mock('node:os', () => ({
  platform: () => 'linux',
  userInfo: () => ({ username: 'personal' }),
}));
vi.mock('node:fs/promises', () => ({
  realpath: async (path: string) => path,
  stat: async (path: string) =>
    path.endsWith('.sock')
      ? { isSocket: () => true, uid: 0, gid: 997, mode: 0o660 }
      : { isDirectory: () => true, uid: 997, mode: 0o700 },
}));

describe('protected Judge setup', () => {
  it('rejects unknown execution policies', () => {
    expect(() => parseDevboxExecutionMode('judge')).toThrow('execution-mode');
    expect(parseDevboxExecutionMode('judge-only')).toBe('judge-only');
  });
  it('does not issue setup commands for root or a shared general Docker socket', async () => {
    const runCommand = vi.fn();
    await expect(
      preflightProtectedService({
        mode: 'judge-only',
        manager: 'systemd',
        serviceUser: 'root',
        checkoutDir: '/var/lib/judge',
        tokenFile: '/var/lib/judge/runner.env',
        cliCommand: ['/opt/bun'],
        dockerHost: 'unix:///run/docker.sock',
        runCommand,
      })
    ).rejects.toThrow();
    expect(runCommand).not.toHaveBeenCalled();
  });
  it('verifies a dedicated non-login user and daemon and rejects personal paths', async () => {
    const runCommand = vi.fn().mockImplementation(async (command: string) => ({
      code: 0,
      stderr: '',
      stdout:
        command === 'getent'
          ? 'judge:x:997:997::/var/lib/judge:/usr/sbin/nologin'
          : command === 'id'
            ? 'judge'
            : JSON.stringify({
                Runtimes: { runsc: {} },
                DefaultRuntime: 'runsc',
                CgroupDriver: 'systemd',
              }),
    }));
    const options = {
      mode: 'judge-only' as const,
      manager: 'systemd',
      serviceUser: 'judge',
      checkoutDir: '/var/lib/judge/work',
      tokenFile: '/var/lib/judge/config/runner.env',
      cliCommand: ['/opt/bun'],
      dockerHost: 'unix:///run/judge/docker.sock',
      runCommand,
    };
    await expect(preflightProtectedService(options)).resolves.toBe(
      '/var/lib/judge'
    );
    await expect(
      preflightProtectedService({
        ...options,
        checkoutDir: '/home/personal/work',
      })
    ).rejects.toThrow('outside personal');
    await expect(
      preflightProtectedService({
        ...options,
        dockerHost: 'unix:///run/docker.sock',
      })
    ).rejects.toThrow('general Docker');
    runCommand.mockImplementation(async (command: string) => ({
      code: 0,
      stderr: '',
      stdout:
        command === 'getent'
          ? 'judge:x:997:997::/var/lib/judge:/usr/sbin/nologin'
          : command === 'id'
            ? 'judge docker'
            : '{}',
    }));
    await expect(preflightProtectedService(options)).rejects.toThrow(
      'general docker group'
    );
  });
  it('renders a service confined to prepared runner directories', () => {
    const unit = renderSystemdUnit({
      checkoutDir: '/var/lib/judge/work',
      wrapperPath: '/var/lib/judge/config/runner.sh',
      serviceHome: '/var/lib/judge',
      serviceUser: 'judge',
      executionMode: 'judge-only',
    });
    for (const setting of [
      'ProtectHome=yes',
      'ProtectSystem=strict',
      'PrivateDevices=yes',
      'CapabilityBoundingSet=',
      'NoNewPrivileges=yes',
      'RestrictNamespaces=yes',
      'UMask=0077',
      'Environment=HOME=/var/lib/judge',
    ])
      expect(unit).toContain(setting);
    expect(unit).toContain(
      'ReadWritePaths=/var/lib/judge/work /var/lib/judge/config /var/lib/judge'
    );
    expect(() =>
      protectedSystemdSettings(
        '/var/lib/%n',
        '/var/lib/judge/run.sh',
        '/var/lib/judge'
      )
    ).toThrow('specifiers');
  });
});
