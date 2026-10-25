import { execFile } from 'node:child_process';
import { z } from 'zod';
import type { HostRegistry } from './resources-hosts-config';

const sampleSchema = z.object({
  platform: z.enum(['darwin', 'linux']),
  occupied: z.number().int().nonnegative(),
  waiting: z.number().int().nonnegative(),
  effectiveLanes: z.number().int().positive(),
  diskFreeGiB: z.number().finite().nonnegative(),
  loadPerCpu: z.number().finite().nonnegative(),
});
export type HostProbe =
  | { healthy: true; sample: z.infer<typeof sampleSchema> }
  | { healthy: false; reason: string };

// Fixed read-only probe code. No workload argv, environment values, checkout
// paths or credentials are interpolated into the SSH shell command.
const python = `import json,os,shutil,subprocess,sys
home=os.path.expanduser('~')
env=dict(os.environ)
env['PATH']=home+'/.bun/bin:'+home+'/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin:'+env.get('PATH','')
r=subprocess.run([home+'/.bun/bin/ttr','resources','status','--json'],env=env,capture_output=True,text=True,timeout=8,check=True)
s=json.loads(r.stdout)
print(json.dumps(dict(platform=s['machine']['platform'],occupied=s['occupied'],waiting=len(s['waiting']),effectiveLanes=s['effectiveLanes'],diskFreeGiB=shutil.disk_usage(home).free/1024**3,loadPerCpu=os.getloadavg()[0]/s['machine']['cpus'])))`;
export const admissionProbeCommand = `python3 -c '${python.replaceAll("'", "'\\''")}'`;

export type ProbeExec = (host: string) => Promise<string>;
export const admissionProbeArgs = (host: string) => [
  '-o',
  'BatchMode=yes',
  '-o',
  'ConnectTimeout=5',
  host,
  admissionProbeCommand,
];
const ssh: ProbeExec = (host) =>
  new Promise((resolve, reject) => {
    execFile(
      'ssh',
      admissionProbeArgs(host),
      { timeout: 12_000, maxBuffer: 64 * 1024, encoding: 'utf8' },
      (error, stdout) => (error ? reject(error) : resolve(stdout))
    );
  });

export async function probeAutomaticHosts(
  registry: HostRegistry,
  exec: ProbeExec = ssh
) {
  const samples = await Promise.all(
    registry.hosts
      .filter((host) => host.kind === 'runner')
      .map(async (host): Promise<[string, HostProbe]> => {
        if (!host.sshHost)
          return [
            host.id,
            {
              healthy: false,
              reason: 'automatic placement needs sshHost for a live lane probe',
            },
          ];
        try {
          const sample = sampleSchema.parse(
            JSON.parse(await exec(host.sshHost))
          );
          return [host.id, { healthy: true, sample }];
        } catch {
          // Do not echo SSH stderr or remote status: either may contain private
          // host paths or config. The host id and bounded failure are actionable.
          return [
            host.id,
            {
              healthy: false,
              reason:
                'SSH admission probe failed, timed out, or returned invalid telemetry',
            },
          ];
        }
      })
  );
  return Object.fromEntries(samples);
}
