import { spawnSync } from 'node:child_process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const label = 'com.tuturuuu.devbox-cli-upgrades';
const xml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

async function main() {
  if (process.platform !== 'darwin')
    throw new Error(
      'This installer targets macOS launchd; schedule the fleet script on your operator host instead'
    );
  const args = process.argv.slice(2);
  const ids = args.flatMap((arg, i) =>
    arg === '--runner' ? [args[i + 1] ?? ''] : []
  );
  if (
    !ids.length ||
    ids.some(
      (id) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
          id
        )
    )
  )
    throw new Error('Pass explicit --runner UUIDs');
  const cli = Bun.which('ttr');
  if (!cli) throw new Error('Install and log into ttr first');
  const directory = join(homedir(), '.tuturuuu', 'devbox-upgrades');
  const script = join(directory, 'devbox-cli-upgrades.ts');
  const plist = join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
  const domain = `gui/${process.getuid?.()}`;
  const command = [
    process.execPath,
    script,
    '--apply',
    ...ids.flatMap((id) => ['--runner', id]),
  ];
  if (args.includes('--dry-run')) {
    console.log(
      JSON.stringify({
        label,
        intervalSeconds: 86400,
        runAtLoad: true,
        script,
        plist,
        command,
      })
    );
    return;
  }
  try {
    await readFile(plist);
    throw new Error('Existing scheduler needs review before replacement');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  await mkdir(dirname(plist), { recursive: true });
  await writeFile(
    script,
    (
      await readFile(join(import.meta.dir, 'devbox-cli-upgrades.ts'), 'utf8')
    ).replace(
      '../packages/sdk/src/cli/devbox-upgrade-lock.ts',
      './devbox-upgrade-lock.ts'
    ),
    { mode: 0o600 }
  );
  await writeFile(
    join(directory, 'devbox-upgrade-lock.ts'),
    await readFile(
      join(import.meta.dir, '../packages/sdk/src/cli/devbox-upgrade-lock.ts')
    ),
    { mode: 0o600 }
  );
  for (const name of ['stdout.log', 'stderr.log'])
    await writeFile(join(directory, name), '', { mode: 0o600, flag: 'a' });
  await writeFile(
    plist,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array>${command.map((arg) => `<string>${xml(arg)}</string>`).join('')}</array>
<key>EnvironmentVariables</key><dict><key>TUTURUUU_UPGRADE_CLI</key><string>${xml(cli)}</string><key>PATH</key><string>${xml(`${dirname(cli)}:${dirname(process.execPath)}:/usr/bin:/bin`)}</string></dict>
<key>StartInterval</key><integer>86400</integer><key>RunAtLoad</key><true/>
<key>StandardOutPath</key><string>${xml(join(directory, 'stdout.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(directory, 'stderr.log'))}</string>
</dict></plist>`,
    { mode: 0o600 }
  );
  const installed = spawnSync('launchctl', ['bootstrap', domain, plist], {
    stdio: 'pipe',
  });
  if (installed.status !== 0)
    throw new Error(
      'Scheduler bootstrap failed; inspect launchctl and the retained plist'
    );
  console.log(
    JSON.stringify({
      label,
      intervalSeconds: 86400,
      runAtLoad: true,
      plist,
      installed: true,
    })
  );
}

if (import.meta.main)
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Upgrade scheduler setup failed'
    );
    process.exitCode = 1;
  });
