// Child diagnostics remain private. Only these fixed classifications leave CI.
const categories = [
  [
    'keychain-access',
    /errSecInternalComponent|user interaction is not allowed|authorization denied/iu,
  ],
  [
    'identity-unavailable',
    /no identity found|specified item could not be found in the keychain/iu,
  ],
  [
    'certificate-trust',
    /unable to build chain to self-signed root|CSSMERR_TP_NOT_TRUSTED|certificate.*(?:expired|revoked)/iu,
  ],
  [
    'unsigned-component',
    /code object is not signed at all|a sealed resource is missing or invalid/iu,
  ],
  [
    'bundle-format',
    /bundle format (?:unrecognized|is ambiguous)|invalid or unsupported format/iu,
  ],
  [
    'resource-metadata',
    /resource fork, Finder information, or similar detritus not allowed/iu,
  ],
  [
    'timestamp-unavailable',
    /timestamp service is not available|unable to reach.*timestamp/iu,
  ],
];
const kinds = new Set([
  'application',
  'nested-application',
  'framework',
  'xpc-service',
  'mach-o',
  'disk-image',
]);
export function codesignDiagnostic(error, artifactKind) {
  const captured = error?.stderr;
  const stderr =
    typeof captured === 'string'
      ? captured.slice(0, 65536)
      : Buffer.isBuffer(captured)
        ? captured.subarray(0, 65536).toString('utf8')
        : '';
  const category =
    categories.find(([, pattern]) => pattern.test(stderr))?.[0] ?? 'unknown';
  const artifact = kinds.has(artifactKind) ? artifactKind : 'unknown';
  const exit =
    Number.isInteger(error?.status) && error.status >= 0 && error.status <= 255
      ? error.status
      : 'unknown';
  return `codesign category=${category} artifact=${artifact} exit=${exit}`;
}
