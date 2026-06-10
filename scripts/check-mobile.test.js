const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');

const { checks, resolvePubCache, runCheck } = require('./check-mobile.js');
const {
  collectMobileDependencyCompatibilityIssues,
  compareVersions,
  getDirectDependencyConstraint,
  getLockedPackageVersion,
} = require('./check-mobile-dependencies.js');
const {
  EXPECTED_IOS_DEPLOYMENT_TARGET,
  collectMobileIosProjectIssues,
} = require('./check-mobile-ios-project.js');

function createMockProc() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  return proc;
}

test('runCheck buffers successful output by default', async () => {
  const proc = createMockProc();
  const stdoutWrites = [];
  const stderrWrites = [];

  const resultPromise = runCheck(
    {
      name: 'flutter-analyze',
      command: 'turbo',
      args: ['run', 'flutter-analyze'],
      parseOutput: () => 'All tests passed',
    },
    {
      spawnImpl: () => proc,
      stdoutWriter: (str) => stdoutWrites.push(str),
      stderrWriter: (str) => stderrWrites.push(str),
    }
  );

  proc.stdout.emit('data', Buffer.from('success output\n'));
  proc.stderr.emit('data', Buffer.from('warning output\n'));
  proc.emit('close', 0);

  const result = await resultPromise;

  assert.equal(result.success, true);
  assert.deepEqual(stdoutWrites, []);
  assert.deepEqual(stderrWrites, []);
});

test('runCheck streams flutter-test output by default', async () => {
  const proc = createMockProc();
  const stdoutWrites = [];
  const stderrWrites = [];

  const resultPromise = runCheck(
    {
      name: 'flutter-test',
      command: 'turbo',
      args: ['run', 'flutter-test'],
      parseOutput: () => 'All tests passed',
    },
    {
      spawnImpl: () => proc,
      stdoutWriter: (str) => stdoutWrites.push(str),
      stderrWriter: (str) => stderrWrites.push(str),
    }
  );

  proc.stdout.emit('data', Buffer.from('00:01 +10: still running\n'));
  proc.emit('close', 0);

  const result = await resultPromise;

  assert.equal(result.success, true);
  assert.deepEqual(stdoutWrites, ['00:01 +10: still running\n']);
  assert.deepEqual(stderrWrites, []);
});

test('runCheck prints buffered output when a check fails', async () => {
  const proc = createMockProc();
  const stdoutWrites = [];
  const stderrWrites = [];

  const resultPromise = runCheck(
    {
      name: 'flutter-analyze',
      command: 'turbo',
      args: ['run', 'flutter-analyze'],
      parseOutput: () => 'Passed',
    },
    {
      spawnImpl: () => proc,
      stdoutWriter: (str) => stdoutWrites.push(str),
      stderrWriter: (str) => stderrWrites.push(str),
    }
  );

  proc.stdout.emit('data', Buffer.from('analysis failed\n'));
  proc.stderr.emit('data', Buffer.from('stacktrace\n'));
  proc.emit('close', 1);

  const result = await resultPromise;

  assert.equal(result.success, false);
  assert.deepEqual(stdoutWrites, []);
  assert.deepEqual(stderrWrites, ['analysis failed\nstacktrace\n']);
});

test('mobile checks invoke local turbo through bun', () => {
  const dartFormatCheck = checks.find((check) => check.name === 'dart-format');

  assert.ok(dartFormatCheck);
  assert.equal(dartFormatCheck.command, 'bun');
  assert.deepEqual(dartFormatCheck.args.slice(0, 1), ['turbo:local']);
});

test('mobile checks include project validators before Flutter checks', () => {
  assert.equal(checks[0].name, 'mobile-dependency-compat');
  assert.deepEqual(checks[0].args, ['scripts/check-mobile-dependencies.js']);
  assert.equal(checks[1].name, 'mobile-ios-project-settings');
  assert.deepEqual(checks[1].args, ['scripts/check-mobile-ios-project.js']);
});

test('resolvePubCache prefers explicit PUB_CACHE', () => {
  const value = resolvePubCache({ PUB_CACHE: 'C:/custom/pub-cache' });
  assert.equal(value, 'C:/custom/pub-cache');
});

test('resolvePubCache derives Windows fallback cache path', () => {
  const value = resolvePubCache(
    {
      LOCALAPPDATA: 'C:/Users/Test/AppData/Local',
    },
    {
      platform: 'win32',
      homeDir: 'C:/Users/Test',
    }
  );
  assert.equal(value, path.join('C:/Users/Test/AppData/Local', 'Pub', 'Cache'));
});

test('resolvePubCache derives macOS fallback cache path', () => {
  const value = resolvePubCache(
    {},
    {
      platform: 'darwin',
      homeDir: '/Users/Test',
    }
  );

  assert.equal(value, path.join('/Users/Test', '.pub-cache'));
});

test('mobile dependency compatibility parses pubspec constraints and lock versions', () => {
  const pubspecText = [
    'dependencies:',
    '  connectivity_plus: 7.0.0',
    '  device_info_plus: 12.3.0',
    '  flutter:',
    '    sdk: flutter',
    '',
  ].join('\n');
  const lockText = [
    'packages:',
    '  connectivity_plus:',
    '    dependency: "direct main"',
    '    description:',
    '      name: connectivity_plus',
    '      url: "https://pub.dev"',
    '    source: hosted',
    '    version: "7.0.0"',
    '  device_info_plus:',
    '    dependency: "direct main"',
    '    description:',
    '      name: device_info_plus',
    '      url: "https://pub.dev"',
    '    source: hosted',
    '    version: "12.3.0"',
    '  other_package:',
    '    version: "1.0.0"',
    '',
  ].join('\n');

  assert.equal(
    getDirectDependencyConstraint(pubspecText, 'connectivity_plus'),
    '7.0.0'
  );
  assert.equal(
    getDirectDependencyConstraint(pubspecText, 'device_info_plus'),
    '12.3.0'
  );
  assert.equal(getLockedPackageVersion(lockText, 'connectivity_plus'), '7.0.0');
  assert.equal(getLockedPackageVersion(lockText, 'device_info_plus'), '12.3.0');
  assert.deepEqual(
    collectMobileDependencyCompatibilityIssues({ lockText, pubspecText }),
    []
  );
});

test('mobile dependency compatibility rejects connectivity_plus Apple CI regression', () => {
  const pubspecText = ['dependencies:', '  connectivity_plus: ^7.1.1', ''].join(
    '\n'
  );
  const lockText = [
    'packages:',
    '  connectivity_plus:',
    '    dependency: "direct main"',
    '    description:',
    '      name: connectivity_plus',
    '    source: hosted',
    '    version: "7.1.1"',
    '',
  ].join('\n');

  const issues = collectMobileDependencyCompatibilityIssues({
    lockText,
    pubspecText,
    rules: [
      {
        firstIncompatibleVersion: '7.1.1',
        packageName: 'connectivity_plus',
        requiredConstraint: '7.0.0',
        requiredLockVersion: '7.0.0',
        reason:
          'connectivity_plus 7.1.1 uses NWPath.isUltraConstrained, which fails the current Xcode 16.4 iOS/macOS CI SDK builds.',
      },
    ],
  });

  assert.equal(issues.length, 2);
  assert.ok(issues[0].includes('must pin connectivity_plus to 7.0.0'));
  assert.ok(issues[1].includes('must resolve connectivity_plus 7.0.0'));
  assert.ok(
    issues.every((issue) => issue.includes('NWPath.isUltraConstrained'))
  );
});

test('mobile dependency compatibility rejects device_info_plus Apple CI regression', () => {
  const pubspecText = ['dependencies:', '  device_info_plus: ^12.4.0', ''].join(
    '\n'
  );
  const lockText = [
    'packages:',
    '  device_info_plus:',
    '    dependency: "direct main"',
    '    description:',
    '      name: device_info_plus',
    '    source: hosted',
    '    version: "12.4.0"',
    '',
  ].join('\n');

  const issues = collectMobileDependencyCompatibilityIssues({
    lockText,
    pubspecText,
    rules: [
      {
        firstIncompatibleVersion: '12.4.0',
        packageName: 'device_info_plus',
        requiredConstraint: '12.3.0',
        requiredLockVersion: '12.3.0',
        reason:
          'device_info_plus 12.4.0 uses NSProcessInfo.isiOSAppOnVision, which fails the current Xcode 16.4 iOS simulator CI SDK build.',
      },
    ],
  });

  assert.equal(issues.length, 2);
  assert.ok(issues[0].includes('must pin device_info_plus to 12.3.0'));
  assert.ok(issues[1].includes('must resolve device_info_plus 12.3.0'));
  assert.ok(issues.every((issue) => issue.includes('isiOSAppOnVision')));
});

test('compareVersions orders semantic version strings numerically', () => {
  assert.equal(compareVersions('7.1.1', '7.1.0'), 1);
  assert.equal(compareVersions('7.0.0', '7.0.0'), 0);
  assert.equal(compareVersions('7.0.0', '7.1.1'), -1);
  assert.equal(compareVersions('7.10.0', '7.2.0'), 1);
  assert.equal(compareVersions('12.4.0', '12.3.0'), 1);
});

test('mobile iOS project settings accepts Xcode recommended settings', () => {
  const projectText = [
    'buildSettings = {',
    `  IPHONEOS_DEPLOYMENT_TARGET = "${EXPECTED_IOS_DEPLOYMENT_TARGET}";`,
    '};',
  ].join('\n');

  assert.deepEqual(collectMobileIosProjectIssues({ projectText }), []);
});

test('mobile iOS project settings rejects stale Xcode recommendations', () => {
  const projectText = [
    'buildSettings = {',
    '  ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES = YES;',
    '  EMBEDDED_CONTENT_CONTAINS_SWIFT = YES;',
    '  IPHONEOS_DEPLOYMENT_TARGET = 13.0;',
    '};',
  ].join('\n');

  const issues = collectMobileIosProjectIssues({ projectText });

  assert.equal(issues.length, 3);
  assert.ok(
    issues.some((issue) =>
      issue.includes('ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES')
    )
  );
  assert.ok(
    issues.some((issue) => issue.includes('EMBEDDED_CONTENT_CONTAINS_SWIFT'))
  );
  assert.ok(
    issues.some((issue) =>
      issue.includes('must use $(RECOMMENDED_IPHONEOS_DEPLOYMENT_TARGET)')
    )
  );
});
