import { execFileSync } from 'node:child_process';
import {
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [bundle, output, version] = process.argv.slice(2);
if (!bundle || !output || !/^\d+\.\d+\.\d+-\d+$/.test(version ?? '')) {
  throw new Error(
    'Expected Linux bundle, output directory, and beta package version'
  );
}
const root = await mkdtemp(join(tmpdir(), 'tuturuuu-linux-package-'));
try {
  await mkdir(join(root, 'DEBIAN'), { recursive: true });
  await mkdir(join(root, 'opt'), { recursive: true });
  await cp(resolve(bundle), join(root, 'opt/tuturuuu'), { recursive: true });
  await chmod(join(root, 'opt/tuturuuu/tuturuuu'), 0o755);
  await writeFile(
    join(root, 'DEBIAN/control'),
    `Package: tuturuuu-beta
Version: ${version}
Section: utils
Priority: optional
Architecture: amd64
Maintainer: Tuturuuu <support@tuturuuu.com>
Homepage: https://tuturuuu.com/download
Depends: pkexec, libgtk-3-0t64, libsecret-1-0, libstdc++6, libc6 (>= 2.39), libasound2t64, libgstreamer1.0-0, libgstreamer-plugins-base1.0-0
Description: Tuturuuu workspace (early-access beta)
 This beta may not be ready for production use.
`
  );
  const applications = join(root, 'usr/share/applications');
  await mkdir(applications, { recursive: true });
  await writeFile(
    join(applications, 'com.tuturuuu.app.mobile.desktop'),
    `[Desktop Entry]
Name=Tuturuuu Beta
Comment=Your connected workspace (early-access beta)
Exec=/opt/tuturuuu/tuturuuu %U
Icon=com.tuturuuu.app.mobile
Terminal=false
Type=Application
Categories=Office;
MimeType=x-scheme-handler/com.tuturuuu.app.mobile;
StartupWMClass=com.tuturuuu.app.mobile
`
  );
  const icons = join(root, 'usr/share/icons/hicolor/512x512/apps');
  await mkdir(icons, { recursive: true });
  await copyFile(
    resolve('apps/mobile/assets/app_icon.png'),
    join(icons, 'com.tuturuuu.app.mobile.png')
  );
  execFileSync(
    'dpkg-deb',
    [
      '--build',
      '--root-owner-group',
      root,
      resolve(output, 'Tuturuuu-linux-x64.deb'),
    ],
    { stdio: 'inherit' }
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
