import { execFileSync, spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

// A visible window is created only after the Flutter engine's first frame.
// This checks installed-package startup and URI activation, not authentication.
const desktop = '/usr/share/applications/com.tuturuuu.app.mobile.desktop';
execFileSync('desktop-file-validate', [desktop], { stdio: 'inherit' });
execFileSync('xdg-mime', [
  'default',
  'com.tuturuuu.app.mobile.desktop',
  'x-scheme-handler/com.tuturuuu.app.mobile',
]);
const app = spawn('/opt/tuturuuu/tuturuuu', [], { stdio: 'inherit' });
let exited = false;
app.on('exit', () => {
  exited = true;
});
app.on('error', () => {
  exited = true;
});
function windows() {
  try {
    return execFileSync(
      'xdotool',
      ['search', '--onlyvisible', '--pid', String(app.pid)],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }
    )
      .trim()
      .split('\n')
      .filter(Boolean);
  } catch {
    return [];
  }
}
try {
  const deadline = Date.now() + 60_000;
  while (!exited && !windows().length && Date.now() < deadline)
    await setTimeout(500);
  if (exited || !windows().length)
    throw new Error('Installed Linux beta did not render a window');
  execFileSync(
    'gio',
    ['open', 'com.tuturuuu.app.mobile://login-callback?desktop_smoke=1'],
    {
      timeout: 15_000,
      stdio: 'inherit',
    }
  );
  await setTimeout(3000);
  if (exited || !windows().length)
    throw new Error('Linux beta exited during URI activation');
  process.stdout.write(
    'Installed Linux beta rendered and survived URI activation.\n'
  );
} finally {
  if (!exited) app.kill('SIGTERM');
}
