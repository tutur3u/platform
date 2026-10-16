const { createHash } = require('node:crypto');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

function installFailureDiagnostic(result) {
  const codes = {
    ERESOLVE: 'dependency-resolution',
    E404: 'registry-response',
    E401: 'registry-response',
    ETARGET: 'dependency-resolution',
    EINTEGRITY: 'integrity',
    ENOTFOUND: 'network',
    ECONNRESET: 'network',
    ETIMEDOUT: 'network',
    EACCES: 'filesystem',
  };
  const streams = {};
  let npmCode = null;
  const prefixes = [];
  for (const name of ['stdout', 'stderr']) {
    const bytes = Buffer.from(result[name]);
    const prefix = bytes.subarray(0, 4096);
    prefixes.push(prefix.toString());
    streams[name] = {
      hashedBytes: bytes.length,
      sha256: hash(bytes),
      prefixHashedBytes: prefix.length,
      prefixSha256: hash(prefix),
    };
    for (const match of prefix
      .toString()
      .matchAll(/^npm (?:error|ERR!) code ([A-Z0-9_]+)\s*$/gm))
      if (Object.hasOwn(codes, match[1])) npmCode = match[1];
  }
  return {
    exitStatus: Number.isSafeInteger(result.status) ? result.status : null,
    signal: ['SIGABRT', 'SIGKILL', 'SIGTERM', 'SIGSEGV', 'SIGINT'].includes(
      result.signal
    )
      ? result.signal
      : null,
    npmCode,
    category: npmCode ? codes[npmCode] : 'unclassified',
    publicRegistryRequests: publicRegistryRequests(prefixes),
    ...streams,
  };
}
const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/;

function publicRegistryRequests(prefixes) {
  const requests = new Map();
  const versions = new Map();
  for (const text of prefixes) {
    for (const line of text.split('\n')) {
      const request = line.match(
        /^npm (?:error|ERR!) 404 Not Found - GET https:\/\/registry\.npmjs\.org\/([^\s?#]+) - Not found\r?$/
      );
      if (request) {
        const name = request[1].replace(/%2f/gi, '/');
        if (name.length <= 214 && PACKAGE.test(name) && requests.size < 8)
          requests.set(name, {
            registry: 'https://registry.npmjs.org',
            package: name,
            version: null,
          });
      }
      const tuple = line.match(
        /^npm (?:error|ERR!) 404 '([^\s']+)' is not in this registry\.\r?$/
      );
      if (tuple) {
        const split = tuple[1].lastIndexOf('@');
        const name = tuple[1].slice(0, split);
        const version = tuple[1].slice(split + 1);
        if (
          name.length <= 214 &&
          PACKAGE.test(name) &&
          version.length <= 128 &&
          VERSION.test(version)
        )
          versions.set(name, version);
      }
    }
  }
  return [...requests.values()].map((request) => ({
    ...request,
    version: versions.get(request.package) ?? null,
  }));
}

module.exports = { installFailureDiagnostic };
