import 'dart:io';

Future<ProcessResult> _run(String command, List<String> arguments) async {
  final result = await Process.run(
    command,
    arguments,
  ).timeout(const Duration(minutes: 2));
  if (result.exitCode != 0) {
    throw const FileSystemException('macOS update failed');
  }
  return result;
}

Future<String> _team(String app) async {
  final result = await _run('/usr/bin/codesign', ['-d', '--verbose=4', app]);
  final match = RegExp(
    r'^TeamIdentifier=([A-Z0-9]{10})$',
    multiLine: true,
  ).firstMatch(result.stderr.toString());
  if (match == null ||
      !result.stderr
          .toString()
          .split('\n')
          .contains('Identifier=com.tuturuuu.app.mobile')) {
    throw const FormatException('Unexpected app signing identity');
  }
  return match[1]!;
}

Future<void> installMacosDesktopUpdate(File image) async {
  final executable = File(Platform.resolvedExecutable);
  final app = executable.parent.parent.parent;
  if (!app.path.endsWith('.app') || app.path.startsWith('/Volumes/')) {
    throw const FileSystemException('Move Tuturuuu into Applications first');
  }
  await _run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app.path]);
  final team = await _team(app.path);
  final mount = await Directory.systemTemp.createTemp('tuturuuu-update-mount-');
  Directory? staging;
  var attached = false;
  var launched = false;
  try {
    await _run('/usr/sbin/spctl', [
      '--assess',
      '--type',
      'open',
      '--context',
      'context:primary-signature',
      image.path,
    ]);
    await _run('/usr/bin/hdiutil', [
      'attach',
      '-readonly',
      '-nobrowse',
      '-mountpoint',
      mount.path,
      image.path,
    ]);
    attached = true;
    final source = '${mount.path}/Tuturuuu.app';
    await _run('/usr/bin/codesign', ['--verify', '--deep', '--strict', source]);
    await _run('/usr/sbin/spctl', ['--assess', '--type', 'execute', source]);
    if (await _team(source) != team) {
      throw const FormatException('Publisher mismatch');
    }
    // Prepare on the destination volume, before quitting. A read-only or
    // unwritable installation fails here without changing the running app.
    staging = await app.parent.createTemp('.tuturuuu-update-');
    final replacement = '${staging.path}/Tuturuuu.app';
    await _run('/usr/bin/ditto', [source, replacement]);
    await _run('/usr/bin/codesign', [
      '--verify',
      '--deep',
      '--strict',
      replacement,
    ]);
    final recovery = Directory('${app.parent.path}/.tuturuuu-desktop-recovery');
    final marker = File('${recovery.path}/owner');
    if (recovery.existsSync()) {
      if (FileSystemEntity.typeSync(recovery.path, followLinks: false) !=
              FileSystemEntityType.directory ||
          !marker.existsSync() ||
          await marker.readAsString() != app.path) {
        throw const FileSystemException(
          'Recovery directory is not updater-owned',
        );
      }
    } else {
      await recovery.create();
      await marker.writeAsString(app.path, flush: true);
    }
    final previous = Directory('${recovery.path}/previous.app');
    if (previous.existsSync()) {
      await _run('/usr/bin/codesign', [
        '--verify',
        '--deep',
        '--strict',
        previous.path,
      ]);
      if (await _team(previous.path) != team) {
        throw const FormatException('Recovery publisher mismatch');
      }
      await previous.delete(recursive: true);
    }
    final helper = File('${staging.path}/install.sh');
    await helper.writeAsString(_macosScript, flush: true);
    await _run('/usr/bin/hdiutil', ['detach', mount.path]);
    attached = false;
    await Process.start('/bin/sh', [
      helper.path,
      '$pid',
      app.path,
      replacement,
      previous.path,
      team,
      staging.path,
    ], mode: ProcessStartMode.detached);
    launched = true;
  } finally {
    if (attached) {
      final detached = await Process.run('/usr/bin/hdiutil', [
        'detach',
        mount.path,
      ]);
      attached = detached.exitCode != 0;
    }
    if (!attached && mount.existsSync()) await mount.delete();
    if (!launched && staging != null && staging.existsSync()) {
      await staging.delete(recursive: true);
    }
  }
}

const _macosScript = r'''
set -eu
parent="$1"; target="$2"; replacement="$3"; backup="$4"; team="$5"; staging="$6"
trap '/usr/bin/open "$target"' EXIT
while kill -0 "$parent" 2>/dev/null; do sleep 1; done
/usr/bin/codesign --verify --deep --strict "$replacement"
/usr/bin/codesign -d --verbose=4 "$replacement" 2>&1 | /usr/bin/grep -qx "TeamIdentifier=$team"
/usr/bin/codesign -d --verbose=4 "$replacement" 2>&1 | /usr/bin/grep -qx "Identifier=com.tuturuuu.app.mobile"
/bin/mv "$target" "$backup"
if ! /bin/mv "$replacement" "$target"; then
  /bin/mv "$backup" "$target"
  /usr/bin/open "$target"
  exit 1
fi
/usr/bin/open "$target"
trap - EXIT
# Keep one previous bundle for recovery; remove only this prepared staging tree.
/bin/rm -rf "$staging"
''';
