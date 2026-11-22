// Runs the image's trusted launcher the way the slot does: as root inside a
// private mount namespace, with the job on stdin. Docker grants only the
// capabilities the launcher needs to build its own sandbox. Egress cases use
// Docker's bridged network so the launcher's network namespace, not Docker,
// is the barrier under test.
import { spawnSync } from 'node:child_process';
import { PLAYGROUND_LANGUAGES } from '../../packages/types/src/primitives/playgrounds.ts';
import { playgroundTemplates } from '../../packages/utils/src/playground-templates.ts';

const image = process.argv[2];
if (!image || !/^(?:[\w./:-]+@)?sha256:[a-f0-9]{64}$/u.test(image)) {
  throw new Error('Pass an immutable image ID or registry digest.');
}

function launch(job, { network = 'none', timeout = 60_000 } = {}) {
  const started = Date.now();
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--pull=never',
      '--platform=linux/amd64',
      `--network=${network}`,
      '--cap-drop=ALL',
      '--cap-add=SYS_ADMIN',
      '--cap-add=SETUID',
      '--cap-add=SETGID',
      '--cap-add=SETPCAP',
      '--cap-add=CHOWN',
      '--cap-add=FOWNER',
      '--cap-add=DAC_OVERRIDE',
      '--cap-add=KILL',
      '--security-opt=seccomp=unconfined',
      '--security-opt=apparmor=unconfined',
      '--memory=2g',
      '--cpus=0.5',
      '--user=0:0',
      '--interactive',
      '--entrypoint=/usr/bin/unshare',
      image,
      '--mount',
      '--propagation',
      'private',
      '/usr/bin/python3',
      '-I',
      '-S',
      '-B',
      '/usr/local/lib/playground/run.py',
    ],
    {
      input: JSON.stringify({ stdin: '', ...job }),
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
      timeout,
    }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`launcher exited ${result.status}: ${result.stderr}`);
  }
  return {
    ...JSON.parse(result.stdout),
    seconds: (Date.now() - started) / 1000,
  };
}

function expect(name, condition, result) {
  if (!condition) {
    throw new Error(`${name} failed: ${JSON.stringify(result).slice(0, 2000)}`);
  }
  console.log(`${name} passed`);
}

const python = (source) => ({
  command: 'python3 main.py',
  files: [{ path: 'main.py', content: source }],
});

for (const language of PLAYGROUND_LANGUAGES) {
  const { path, content, command } = playgroundTemplates[language];
  const result = launch({ command, files: [{ path, content }] });
  expect(
    language,
    result.outcome === 'exited' &&
      result.exitCode === 0 &&
      result.output.trim() === 'Hello, playground!',
    result
  );
}

const identity = launch(
  python(`
from pathlib import Path
status = dict(l.split(":", 1) for l in Path("/proc/self/status").read_text().splitlines())
caps = [int(status[k], 16) for k in ("CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb")]
import os
print(os.getuid(), os.getgid(), os.getgroups(), caps, status["NoNewPrivs"].strip(), os.getpid())
`)
);
expect(
  'identity and capabilities',
  identity.outcome === 'exited' &&
    /^65534 65534 \[\] \[0, 0, 0, 0, 0\] 1 \d+$/u.test(identity.output.trim()),
  identity
);

// Positive control: the runner's bridged network must reach the Internet, or
// the launcher case below would pass without exercising its namespace.
const control = spawnSync(
  'docker',
  [
    'run',
    '--rm',
    '--pull=never',
    '--platform=linux/amd64',
    '--network=bridge',
    '--entrypoint=/usr/bin/python3',
    image,
    '-I',
    '-c',
    `
import socket
reached = 0
for host in ("1.1.1.1", "8.8.8.8"):
    try:
        socket.create_connection((host, 443), timeout=5).close()
        reached += 1
    except OSError:
        pass
raise SystemExit(0 if reached else 1)
`,
  ],
  { encoding: 'utf8', timeout: 30_000 }
);
if (control.error) throw control.error;
if (control.status !== 0) {
  throw new Error(
    'The bridged network has no egress; the egress case would be vacuous.'
  );
}
console.log('bridged network control reached the Internet');

const egress = launch(
  python(`
import socket
reached = []
for host, port in (("1.1.1.1", 53), ("8.8.8.8", 443), ("169.254.169.254", 80), ("172.17.0.1", 80), ("10.0.0.1", 80)):
    s = socket.socket()
    s.settimeout(2)
    try:
        s.connect((host, port))
        reached.append(host)
    except OSError:
        pass
    finally:
        s.close()
try:
    socket.getaddrinfo("example.com", 443)
    reached.append("dns")
except OSError:
    pass
print("reached", reached)
`),
  { network: 'bridge' }
);
expect(
  'egress denied on a bridged network',
  egress.outcome === 'exited' && egress.output.trim() === 'reached []',
  egress
);

const writes = launch(
  python(`
import os
denied = []
for target in ("/etc/playground", "/usr/local/lib/playground/run.py", "/var/tmp/x", "/root/x", "/dev/shm/x"):
    try:
        with open(target, "a") as handle:
            handle.write("x")
    except OSError:
        denied.append(target)
with open("/tmp/workspace/out.txt", "w") as handle:
    handle.write("kept\\n")
os.symlink("/etc/passwd", "/tmp/workspace/link")
print(len(denied))
`)
);
expect(
  'writes bounded to the workspace',
  writes.outcome === 'exited' &&
    writes.output.trim() === '5' &&
    writes.files.some(
      (file) => file.path === 'out.txt' && file.content === 'kept\n'
    ) &&
    !writes.files.some((file) => file.path === 'link'),
  writes
);

const timeout = launch(python('import time\ntime.sleep(120)\n'));
expect(
  'command timeout',
  timeout.outcome === 'timeout' &&
    timeout.exitCode === 124 &&
    timeout.seconds >= 25 &&
    timeout.seconds < 45 &&
    timeout.files === null,
  timeout
);

const flood = launch({ command: 'yes', files: [] });
expect(
  'output limit',
  flood.outcome === 'output_limit' &&
    Buffer.byteLength(flood.output) <= 64 * 1024,
  flood
);

const forks = launch(
  python(`
import os
children = 0
try:
    for _ in range(1000):
        if os.fork() == 0:
            import time
            time.sleep(60)
            os._exit(0)
        children += 1
except OSError:
    pass
print(children < 128, flush=True)
os._exit(0)
`)
);
expect(
  'process limit',
  forks.outcome === 'exited' && forks.output.trim() === 'True',
  forks
);
