// Pure helpers for the Mac App Store package: entitlement rendering, profile
// coverage and Mach-O classification. No I/O, so they are unit tested.

export const MAC_APP_STORE_BUNDLE_ID = 'com.tuturuuu.app.mobile';

// Sandbox and hardware keys are granted by the sandbox itself; every other key
// must also appear in the provisioning profile or App Store validation rejects it.
const SANDBOX_ONLY = /^com\.apple\.security\./u;

export const INHERITED_SANDBOX = Object.freeze({
  'com.apple.security.app-sandbox': true,
  'com.apple.security.inherit': true,
});

function expand(value, variables) {
  if (typeof value === 'string')
    return value.replace(/\$\(([A-Za-z_]+)\)/gu, (match, name) => {
      if (!(name in variables)) throw new Error(`Unresolved ${match}`);
      return variables[name];
    });
  if (Array.isArray(value)) return value.map((item) => expand(item, variables));
  return value;
}

/** Resolves Xcode variables and adds the identifiers Xcode adds when it signs. */
export function renderEntitlements(
  source,
  { teamId, bundleId = MAC_APP_STORE_BUNDLE_ID }
) {
  if (!/^[A-Z0-9]{10}$/u.test(teamId ?? '')) throw new Error('Invalid team');
  if (source['com.apple.security.app-sandbox'] !== true)
    throw new Error('Mac App Store entitlements must enable the app sandbox');
  const variables = {
    AppIdentifierPrefix: `${teamId}.`,
    PRODUCT_BUNDLE_IDENTIFIER: bundleId,
  };
  const rendered = {};
  for (const [key, value] of Object.entries(source))
    rendered[key] = expand(value, variables);
  rendered['com.apple.application-identifier'] = `${teamId}.${bundleId}`;
  rendered['com.apple.developer.team-identifier'] = teamId;
  return rendered;
}

function allowed(granted, requested) {
  if (granted === undefined) return false;
  if (typeof granted === 'string' && granted.endsWith('*'))
    return [requested]
      .flat()
      .every(
        (item) =>
          typeof item === 'string' && item.startsWith(granted.slice(0, -1))
      );
  if (Array.isArray(granted)) {
    if (granted.includes('*')) return true;
    return [requested]
      .flat()
      .every((item) =>
        granted.some((entry) =>
          typeof entry === 'string' && entry.endsWith('*')
            ? String(item).startsWith(entry.slice(0, -1))
            : entry === item
        )
      );
  }
  return JSON.stringify(granted) === JSON.stringify(requested);
}

/** Fails closed unless the profile is a Mac App Store profile for this app. */
export function verifyProfile(
  profile,
  entitlements,
  { teamId, bundleId = MAC_APP_STORE_BUNDLE_ID, now = new Date() }
) {
  if (!profile?.Platform?.includes('OSX'))
    throw new Error('Profile is not a macOS profile');
  if (profile.ProvisionedDevices || profile.ProvisionsAllDevices)
    throw new Error('Profile is not a Mac App Store distribution profile');
  if (profile.TeamIdentifier?.[0] !== teamId)
    throw new Error('Profile team mismatch');
  const granted = profile.Entitlements ?? {};
  if (granted['com.apple.application-identifier'] !== `${teamId}.${bundleId}`)
    throw new Error('Profile application identifier mismatch');
  if (granted['get-task-allow'] === true)
    throw new Error('Profile allows debugging');
  if (!(new Date(profile.ExpirationDate) > now))
    throw new Error('Profile expired');
  const missing = Object.entries(entitlements)
    .filter(([key]) => !SANDBOX_ONLY.test(key))
    .filter(([key, value]) => !allowed(granted[key], value))
    .map(([key]) => key);
  if (missing.length)
    throw new Error(`Profile does not grant: ${missing.sort().join(', ')}`);
  return profile.UUID;
}

const MH_EXECUTE = 2;
const THIN = new Map([
  [0xfeedface, 'big'],
  [0xfeedfacf, 'big'],
  [0xcefaedfe, 'little'],
  [0xcffaedfe, 'little'],
]);

/** Returns 'executable', 'library' or null for a file's leading bytes. */
export function machOKind(bytes) {
  if (bytes.length < 16) return null;
  let header = bytes;
  const magic = bytes.readUInt32BE(0);
  if (magic === 0xcafebabe || magic === 0xcafebabf) {
    // Universal binary: classify by the first architecture slice.
    const architectures = bytes.readUInt32BE(4);
    if (architectures < 1 || architectures > 16 || bytes.length < 28)
      return null;
    const offset =
      magic === 0xcafebabf
        ? Number(bytes.readBigUInt64BE(16))
        : bytes.readUInt32BE(16);
    if (offset + 16 > bytes.length) return null;
    header = bytes.subarray(offset);
  }
  const endian = THIN.get(header.readUInt32BE(0));
  if (!endian) return null;
  const type =
    endian === 'big' ? header.readUInt32BE(12) : header.readUInt32LE(12);
  return type === MH_EXECUTE ? 'executable' : 'library';
}
