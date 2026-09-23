import 'dart:io';

import 'package:mobile/features/desktop_update/desktop_macos_installer.dart';
import 'package:mobile/features/desktop_update/desktop_release.dart';
import 'package:mobile/features/desktop_update/desktop_update_repository.dart';

/// Called only after an explicit install choice (including saved next-launch
/// consent). OS errors leave the running app available for retry.
class DesktopInstaller {
  Future<void> install(
    DesktopRelease release,
    DesktopUpdateRepository repository,
  ) async {
    if (!await repository.verified(release)) {
      throw const FormatException('Update integrity check failed');
    }
    final file = repository.package(release);
    if (Platform.isMacOS) {
      await installMacosDesktopUpdate(file);
    } else if (Platform.isWindows) {
      await _installWindows(file, release.digest);
    } else if (Platform.isLinux) {
      // The root-owned helper stages and rechecks bytes after authorization.
      final result = await Process.run('/usr/bin/pkexec', [
        '/usr/lib/tuturuuu/install-update',
        file.absolute.path,
        release.digest,
      ]);
      if (result.exitCode != 0) {
        throw const FileSystemException('Install cancelled');
      }
      final helper = File('${file.parent.path}/relaunch.sh');
      await helper.writeAsString(_linuxScript, flush: true);
      await Process.start('/bin/sh', [
        helper.path,
        '$pid',
        '/opt/tuturuuu/tuturuuu',
      ], mode: ProcessStartMode.detached);
    } else {
      throw UnsupportedError('Desktop platform required');
    }
    exit(0);
  }

  Future<void> _installWindows(File file, String digest) async {
    final script = File('${file.parent.path}/install-update.ps1');
    await script.writeAsString(_windowsScript, flush: true);
    // Verification before quitting keeps an invalid installer from terminating
    // the current session. The helper repeats it immediately before execution.
    final verified = await Process.run('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script.path,
      file.path,
      Platform.resolvedExecutable,
      digest,
      '0',
    ]);
    if (verified.exitCode != 0) {
      throw const FileSystemException('Installer signature invalid');
    }
    await Process.start('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script.path,
      file.path,
      Platform.resolvedExecutable,
      digest,
      '$pid',
    ], mode: ProcessStartMode.detached);
  }
}

const _windowsScript = r'''
param([string]$Package, [string]$Executable, [string]$Digest, [int]$ParentProcess)
$ErrorActionPreference = 'Stop'
function Verify-Update {
  if ((Get-FileHash -LiteralPath $Package -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Digest) { throw 'Checksum mismatch' }
  $current = Get-AuthenticodeSignature -LiteralPath $Executable
  $update = Get-AuthenticodeSignature -LiteralPath $Package
  if ($current.Status -ne 'Valid' -or $update.Status -ne 'Valid' -or
      !$current.SignerCertificate -or !$update.SignerCertificate -or
      $current.SignerCertificate.Subject -ne $update.SignerCertificate.Subject) { throw 'Publisher mismatch' }
}
if ($ParentProcess -eq 0) { Verify-Update; exit 0 }
Wait-Process -Id $ParentProcess -ErrorAction SilentlyContinue
try {
Verify-Update
$directory = [System.IO.Path]::GetDirectoryName($Executable)
$arguments = @('/SILENT','/NORESTART','/CLOSEAPPLICATIONS','/NORESTARTAPPLICATIONS', ('/DIR="' + $directory + '"'))
$install = Start-Process -FilePath $Package -ArgumentList $arguments -Wait -PassThru
if ($install.ExitCode -ne 0) { throw 'Install failed' }
} finally {
  if (Test-Path -LiteralPath $Executable) { Start-Process -FilePath $Executable }
}
''';

const _linuxScript = r'''
set -eu
parent="$1"; executable="$2"
while kill -0 "$parent" 2>/dev/null; do sleep 1; done
exec "$executable"
''';
