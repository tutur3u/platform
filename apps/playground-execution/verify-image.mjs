import { spawnSync } from 'node:child_process';
import { PLAYGROUND_LANGUAGES } from '../../packages/types/src/primitives/playgrounds.ts';
import { playgroundTemplates } from '../../packages/utils/src/playground-templates.ts';

const image = process.argv[2];
if (!image || !/^(?:[\w./:-]+@)?sha256:[a-f0-9]{64}$/u.test(image)) {
  throw new Error('Pass an immutable image ID or registry digest.');
}

const runTemplate = `
import json
import os
import subprocess
import sys
from pathlib import Path

assert os.getuid() == os.getgid() == 65534
status = dict(line.split(":", 1) for line in Path("/proc/self/status").read_text().splitlines())
for key in ("CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb"):
    assert int(status[key], 16) == 0, key
assert int(status["NoNewPrivs"]) == 1
template = json.load(sys.stdin)
workspace = Path("/workspace")
(workspace / template["path"]).write_text(template["content"], encoding="utf-8")
raise SystemExit(subprocess.run(
    ["/bin/sh", "-c", template["command"]],
    cwd=workspace,
    stdin=subprocess.DEVNULL,
    timeout=30,
).returncode)
`;

for (const language of PLAYGROUND_LANGUAGES) {
  const result = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--pull=never',
      '--platform=linux/amd64',
      '--network=none',
      '--read-only',
      '--cap-drop=ALL',
      '--security-opt=no-new-privileges',
      '--pids-limit=128',
      '--memory=1g',
      '--cpus=0.5',
      '--tmpfs=/tmp:rw,exec,nosuid,nodev,size=128m',
      '--tmpfs=/workspace:rw,exec,nosuid,nodev,uid=65534,gid=65534,mode=0700,size=64m',
      '--interactive',
      '--entrypoint=/usr/bin/python3',
      image,
      '-I',
      '-B',
      '-c',
      runTemplate,
    ],
    {
      input: JSON.stringify(playgroundTemplates[language]),
      encoding: 'utf8',
      maxBuffer: 65536,
      timeout: 45_000,
    }
  );
  if (result.error) throw result.error;
  if (result.status !== 0 || result.stdout.trim() !== 'Hello, playground!') {
    throw new Error(
      `${language} failed (exit ${result.status}): ${result.stderr || result.stdout}`
    );
  }
  console.log(`${language} passed`);
}
