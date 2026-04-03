#!/usr/bin/env node

const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_DEBUG_ALIAS = 'androiddebugkey';
const DEFAULT_DEBUG_PASSWORD = 'android';
const DEFAULT_REPO_KEY_PROPERTIES_FILE = 'apps/mobile/android/key.properties';

function parseArgs(argv) {
  const parsed = {
    debug: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case '--keystore':
      case '--keystore-file':
        parsed.keystore = next;
        index += 1;
        break;
      case '--alias':
        parsed.alias = next;
        index += 1;
        break;
      case '--store-password':
      case '--storepass':
        parsed.storePassword = next;
        index += 1;
        break;
      case '--key-password':
      case '--keypass':
        parsed.keyPassword = next;
        index += 1;
        break;
      case '--key-properties-file':
        parsed.keyPropertiesFile = next;
        index += 1;
        break;
      case '--apk-file':
      case '--aab-file':
      case '--jar-file':
        parsed.jarFile = next;
        parsed.jarFileType = arg.slice(2);
        index += 1;
        break;
      case '--keytool':
        parsed.keytool = next;
        index += 1;
        break;
      case '--java-home':
        parsed.javaHome = next;
        index += 1;
        break;
      case '--debug':
        parsed.debug = true;
        break;
      case '--json':
        parsed.json = true;
        break;
      case '--help':
      case '-h':
        parsed.help = true;
        break;
      default:
        if (arg.startsWith('--')) {
          throw new Error(`Unknown argument: ${arg}`);
        }
    }
  }

  return parsed;
}

function printUsage(stdout = process.stdout) {
  stdout.write(`Usage:
  bun android:self-sign --debug
  bun android:self-sign --keystore <path> --alias <alias> --store-password <password>
  bun android:self-sign --apk-file <path>

Options:
  --debug                        Read the default Android debug keystore (~/.android/debug.keystore)
  --keystore, --keystore-file    Path to a JKS/PKCS12 keystore
  --alias                        Signing key alias inside the keystore
  --store-password, --storepass  Keystore password
  --key-password, --keypass      Private key password (optional)
  --key-properties-file          Path to Android key.properties
  --apk-file                     Inspect the certificate embedded in an APK
  --aab-file                     Inspect the certificate embedded in an AAB
  --jar-file                     Inspect the certificate embedded in a generic JAR-like archive
  --keytool                      Path to the keytool binary
  --java-home                    JAVA_HOME to resolve keytool from
  --json                         Print JSON metadata with SHA-1/SHA-256/MD5
  --help, -h                     Show this help text

Resolution order for keystore mode:
  1. Explicit CLI flags
  2. ANDROID_KEYSTORE_* environment variables
  3. ${DEFAULT_REPO_KEY_PROPERTIES_FILE} (when present)
`);
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }

  return value.trim();
}

function expandHomeDir(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return filePath;
  }

  if (filePath === '~') {
    return os.homedir();
  }

  if (filePath.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), filePath.slice(2));
  }

  return filePath;
}

function loadKeyPropertiesFile(filePath, fsImpl = fs) {
  const resolvedPath = path.resolve(
    expandHomeDir(requireString(filePath, 'keyPropertiesFile'))
  );
  const content = fsImpl.readFileSync(resolvedPath, 'utf8');
  const properties = {};

  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#') || line.startsWith('!')) {
      continue;
    }

    const separatorIndex = line.search(/[:=]/u);
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    properties[key] = value;
  }

  return {
    path: resolvedPath,
    properties,
  };
}

function loadDefaultKeyProperties(cwd = process.cwd(), fsImpl = fs) {
  const resolvedPath = path.resolve(cwd, DEFAULT_REPO_KEY_PROPERTIES_FILE);
  if (!fsImpl.existsSync(resolvedPath)) {
    return null;
  }

  return loadKeyPropertiesFile(resolvedPath, fsImpl);
}

function resolveKeytoolPath({ keytool, javaHome, env = process.env }) {
  if (typeof keytool === 'string' && keytool.trim().length > 0) {
    return keytool.trim();
  }

  const effectiveJavaHome =
    typeof javaHome === 'string' && javaHome.trim().length > 0
      ? javaHome.trim()
      : env.JAVA_HOME;

  if (
    typeof effectiveJavaHome === 'string' &&
    effectiveJavaHome.trim().length > 0
  ) {
    const executableName =
      process.platform === 'win32' ? 'keytool.exe' : 'keytool';
    return path.join(effectiveJavaHome.trim(), 'bin', executableName);
  }

  return 'keytool';
}

function resolveMaybeRelativePath(filePath, baseDirectory) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    return undefined;
  }

  const expandedPath = expandHomeDir(filePath.trim());
  if (path.isAbsolute(expandedPath)) {
    return path.resolve(expandedPath);
  }

  return path.resolve(baseDirectory, expandedPath);
}

function resolveKeystoreInput(args, options = {}) {
  const { cwd = process.cwd(), env = process.env, fsImpl = fs } = options;
  const hasJarInput =
    typeof args.jarFile === 'string' && args.jarFile.trim().length > 0;

  if (hasJarInput) {
    return {
      jarFile: path.resolve(cwd, expandHomeDir(args.jarFile.trim())),
      mode: 'jar',
    };
  }

  if (args.debug) {
    return {
      alias: DEFAULT_DEBUG_ALIAS,
      keystore: path.resolve(os.homedir(), '.android/debug.keystore'),
      mode: 'keystore',
      source: 'debug-keystore',
      storePassword: DEFAULT_DEBUG_PASSWORD,
    };
  }

  let loadedKeyProperties = null;
  if (
    typeof args.keyPropertiesFile === 'string' &&
    args.keyPropertiesFile.trim().length > 0
  ) {
    loadedKeyProperties = loadKeyPropertiesFile(args.keyPropertiesFile, fsImpl);
  } else {
    loadedKeyProperties = loadDefaultKeyProperties(cwd, fsImpl);
  }

  const keyProperties = loadedKeyProperties?.properties ?? {};
  const envConfig = {
    alias: env.ANDROID_KEYSTORE_ALIAS,
    keyPassword: env.ANDROID_KEYSTORE_PRIVATE_KEY_PASSWORD,
    keystore: env.ANDROID_KEYSTORE_PATH,
    storePassword: env.ANDROID_KEYSTORE_PASSWORD,
  };

  const merged = {
    alias: args.alias ?? envConfig.alias ?? keyProperties.keyAlias,
    keyPassword:
      args.keyPassword ?? envConfig.keyPassword ?? keyProperties.keyPassword,
    keystore: args.keystore ?? envConfig.keystore ?? keyProperties.storeFile,
    storePassword:
      args.storePassword ??
      envConfig.storePassword ??
      keyProperties.storePassword,
  };

  const keyPropertiesBaseDirectory = loadedKeyProperties
    ? path.join(path.dirname(loadedKeyProperties.path), 'app')
    : cwd;

  return {
    alias: merged.alias,
    keyPassword: merged.keyPassword,
    keystore:
      typeof args.keystore === 'string' && args.keystore.trim().length > 0
        ? resolveMaybeRelativePath(args.keystore, cwd)
        : typeof envConfig.keystore === 'string' &&
            envConfig.keystore.trim().length > 0
          ? resolveMaybeRelativePath(envConfig.keystore, cwd)
          : resolveMaybeRelativePath(
              merged.keystore,
              keyPropertiesBaseDirectory
            ),
    keyPropertiesFile: loadedKeyProperties?.path,
    mode: 'keystore',
    source: loadedKeyProperties ? 'key-properties-or-env' : 'cli-or-env',
    storePassword: merged.storePassword,
  };
}

function buildKeytoolArgs(input) {
  if (input.mode === 'jar') {
    return ['-printcert', '-jarfile', requireString(input.jarFile, 'jarFile')];
  }

  const keystore = requireString(input.keystore, 'keystore');
  const alias = requireString(input.alias, 'alias');
  const args = ['-list', '-v', '-alias', alias, '-keystore', keystore];

  if (
    typeof input.storePassword === 'string' &&
    input.storePassword.trim().length > 0
  ) {
    args.push('-storepass', input.storePassword.trim());
  } else {
    throw new Error(
      'storePassword is required for non-interactive keystore inspection'
    );
  }

  if (
    typeof input.keyPassword === 'string' &&
    input.keyPassword.trim().length > 0
  ) {
    args.push('-keypass', input.keyPassword.trim());
  }

  return args;
}

function parseFingerprints(output) {
  const fingerprints = {};
  const pattern = /\b(MD5|SHA1|SHA-1|SHA256|SHA-256):\s*([0-9A-F:]+)/giu;

  for (const match of output.matchAll(pattern)) {
    const label = match[1].toUpperCase();
    const fingerprint = match[2].toUpperCase();

    if (label === 'MD5') {
      fingerprints.md5 = fingerprint;
    }

    if (label === 'SHA1' || label === 'SHA-1') {
      fingerprints.sha1 = fingerprint;
    }

    if (label === 'SHA256' || label === 'SHA-256') {
      fingerprints.sha256 = fingerprint;
    }
  }

  if (!fingerprints.sha1 && !fingerprints.sha256 && !fingerprints.md5) {
    throw new Error('No fingerprints found in keytool output');
  }

  return fingerprints;
}

function inspectAndroidSigningCertificate(args, options = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    execFileSync = childProcess.execFileSync,
    fsImpl = fs,
  } = options;

  const input = resolveKeystoreInput(args, { cwd, env, fsImpl });
  const keytoolPath = resolveKeytoolPath({
    env,
    javaHome: args.javaHome,
    keytool: args.keytool,
  });
  const keytoolArgs = buildKeytoolArgs(input);

  const output = execFileSync(keytoolPath, keytoolArgs, {
    encoding: 'utf8',
  });
  const fingerprints = parseFingerprints(output);

  return {
    alias: input.alias,
    inputType: input.mode,
    jarFile: input.jarFile,
    keyPropertiesFile: input.keyPropertiesFile,
    keystore: input.keystore,
    keytoolPath,
    source: input.source,
    ...fingerprints,
  };
}

function formatHumanOutput(result) {
  const lines = [];

  if (result.sha1) {
    lines.push(`SHA-1: ${result.sha1}`);
  }

  if (result.sha256) {
    lines.push(`SHA-256: ${result.sha256}`);
  }

  if (result.md5) {
    lines.push(`MD5: ${result.md5}`);
  }

  return `${lines.join('\n')}\n`;
}

function main(
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  options = {}
) {
  try {
    const args = parseArgs(argv);

    if (args.help) {
      printUsage(stdout);
      return 0;
    }

    const result = inspectAndroidSigningCertificate(args, options);

    if (args.json) {
      stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }

    stdout.write(formatHumanOutput(result));
    return 0;
  } catch (error) {
    stderr.write(
      `${error instanceof Error ? error.message : 'Failed to inspect Android signing certificate'}\n`
    );
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  DEFAULT_DEBUG_ALIAS,
  DEFAULT_DEBUG_PASSWORD,
  DEFAULT_REPO_KEY_PROPERTIES_FILE,
  buildKeytoolArgs,
  formatHumanOutput,
  inspectAndroidSigningCertificate,
  loadDefaultKeyProperties,
  loadKeyPropertiesFile,
  main,
  parseArgs,
  parseFingerprints,
  printUsage,
  resolveMaybeRelativePath,
  resolveKeystoreInput,
  resolveKeytoolPath,
};
