import { createHash } from 'node:crypto';
import { assertPacketTap } from './employee-schema-tap.mjs';

const profileName = 'employee-creation-composed-v1';
const baseSourceSha = '84ec8e04c4a412c7dd1501f2bb7ce14c0dda01ea';
const failure = () => new Error('Employee composed profile contract denied');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

// Frozen source bytes only. These hashes are never database catalog hashes.
// SQL2 ba3931b1, journal9 2904ec9f, supplier4 ee8d6b60, shared16 82a56175.
// Original84ec canonical migrations, foundation packets and lock are retained.
const sourceFiles = [
  [
    'apps/database/supabase/migrations/20261011002107_employee_creation_identity.sql',
    '0204d2ffb2b016b7e0bc4a57ece1c43538e7a3331845b1bb7fd845a38c3dbe5a',
  ],
  [
    'apps/database/supabase/migrations/20261011002108_employee_creation_finalization.sql',
    '1ef19dfbdfd5bc668c7c1767aec041e28ecb7e1352291152a108d9716382367d',
  ],
  [
    'apps/database/supabase/migrations/20261011002109_employee_restoration.sql',
    '24d8df606b1f51093f532bea2c69b1da864f6172f8bfb05285936d6210cd7f90',
  ],
  [
    'apps/database/supabase/migrations/20261016093001_employee_creation_operations.sql',
    'dcf12e21c790dcb7e32f640fe0e7306ead029065c1f7f5a30599d43a48998b24',
  ],
  [
    'apps/database/supabase/migrations/20261016093002_employee_creation_reserved_preflight.sql',
    'b9d31648abcb906509a685e02f86a1718ffaed96a6f3076f82781d9b3ce33618',
  ],
  [
    'apps/database/supabase/tests/employee-administrator.sql',
    '2408463b4caaccd5d20253a57383976b991f1480e79929eb1ffff4ac3686f08e',
  ],
  [
    'apps/database/supabase/tests/employee-creation-operations.sql',
    '7bdb976426f51518d7cc69fef90d4b95a3ec957a198ae2493c96756a0d118ff5',
  ],
  [
    'apps/database/supabase/tests/employee-creation-reserved-preflight.sql',
    '5a9a6e9e216b4cf334d433a2b5417c4978d0cfd396bfec885ae6666afb80d019',
  ],
  [
    'apps/database/supabase/tests/employee-finalization.sql',
    '474366a07604765fd7efa1d678f209b6057528c32becef590a9c69763cb137b3',
  ],
  [
    'apps/database/supabase/tests/employee-identity-contract.sql',
    'b67fe71f2270fdf714284afe2bac3ce3ac19d12250eb7d3bec3199e394d81fd9',
  ],
  [
    'apps/database/supabase/tests/employee-restoration.sql',
    'f07d034034c88c17a357bc23c9a39ffc368af2e1030303bfe65d9cd10281ccd1',
  ],
  [
    'apps/database/supabase/tests/employee-signup-guards.sql',
    'eb1e0d9b7c29177a675b8e58113ba912077fd8aa3c318761d082b1d31d2f2f66',
  ],
  [
    'apps/docs/platform/applications/infrastructure.mdx',
    '4eaf4ad6d1fabf8c6e4ac487bba0ae53b520783bc7520b1f94185e30885480d5',
  ],
  [
    'apps/docs/reference/repository/catalog.mdx',
    '64bb6a8e1971581d05cef42e22228406013ff2bbce3dd3f743e73783b60bde1d',
  ],
  [
    'apps/infrastructure/src/lib/internal-accounts/employee-creation-database-readiness.ts',
    '88b85a8023dbe9872a5128573783a3e1cc40b3812cb692d908c92a79b8c40bd5',
  ],
  [
    'apps/infrastructure/src/lib/internal-accounts/employee-creation-sql.ts',
    '39c56ba036678f09f3ecb3ab9dc743eaa8c1eca4d401d72cad493e1397e57d72',
  ],
  [
    'apps/infrastructure/src/lib/internal-accounts/employee-fixed-sql-process.ts',
    '2d298f1cb08eb75c0de0151099e7e65328a6fd83217a620ce732fb74a465112f',
  ],
  [
    'apps/infrastructure/src/lib/internal-accounts/employee-fixed-sql-protocol.d.mts',
    '34dca79959964bdaf7836407246d124c2287503bb4639e11781dcc12725f39ca',
  ],
  [
    'apps/infrastructure/src/lib/internal-accounts/employee-fixed-sql-protocol.mjs',
    '34dca79959964bdaf7836407246d124c2287503bb4639e11781dcc12725f39ca',
  ],
  [
    'apps/infrastructure/src/lib/internal-accounts/employee-fixed-sql-worker.mjs',
    '0941b9ae78012c823e4e4492c1d40e1534390fa649760531d901138b8f0e7d2e',
  ],
  [
    'apps/infrastructure/src/lib/internal-accounts/employee-sql-catalog-readiness.ts',
    '4a5470f7ca244858286cd02f9d1b69d844f5cf209d4bca4d2af1121ab3295edf',
  ],
  [
    'apps/web/src/lib/infrastructure/employee-creation-journal.test.ts',
    'd0ac20220daf0296d76efe3fc34364f3078327d9cfefd202d6091789c099bdd4',
  ],
  [
    'apps/web/src/lib/infrastructure/employee-creation-journal.ts',
    '6e7681ff28db9ef657ecd3891009b6f2af97f70856900aa8c28d5c0b1332600e',
  ],
  [
    'apps/web/src/lib/infrastructure/employee-creation-operation-store.test-fixture.ts',
    '92ec5d6a8ab159407c62dae87d6d5ba17bda0a1df95136b131fe2578ae7b05e3',
  ],
  [
    'apps/web/src/lib/infrastructure/employee-creation-operation-store.test.ts',
    '6ca09ca91c57d5bc12ecb3250eee4e84e3d8c6f04080147576493c140e9074a1',
  ],
  [
    'apps/web/src/lib/infrastructure/employee-creation-operation-store.ts',
    '029b3f4e9bb1bdf7569d8b182a430ed2cc2eb78bdaa1c22cefb8d09d9b4f4c4a',
  ],
  [
    'apps/web/src/lib/infrastructure/employee-creation-phase-adapter.test.ts',
    '42644ebe75ba15af5e532fbc0be7ea80e417f1ea010c871482beeb2f7a8e6eaa',
  ],
  [
    'apps/web/src/lib/infrastructure/employee-creation-phase-adapter.ts',
    'e3b920d7dff89f99bc56351a47d01ce0930d7c83458d38e83fe7bd3f5aac12ec',
  ],
  [
    'apps/web/src/lib/infrastructure/employee-creation-readiness.test.ts',
    '16d571509ce6323bc6d7c984ef215710e9a2011b21e53b68cea14ec8c962a52b',
  ],
  [
    'apps/web/src/lib/infrastructure/employee-creation-readiness.ts',
    '58124dfb68cf3baf121d7a542ea14387bd35da34f696adf02dfcc3588b22ed0c',
  ],
  [
    'apps/web/src/lib/infrastructure/employee-creation-supplier.test.ts',
    '2293ff642f44c3b6595adde6415862d781ec016439520fab8b3359d46dca41cd',
  ],
  [
    'apps/web/src/lib/infrastructure/employee-creation-supplier.ts',
    'e2cfc992173decb26feb6cd76ecbc80642f3650f7a96b94cee8317ea24be5759',
  ],
  [
    'bun.lock',
    '2c1db57eae3a77096d1ed000c2fc8bb211e5bf5132f429def3e785e9bd31b378',
  ],
  [
    'packages/inventory-core/package.json',
    '216fd6711ca2a387f961deed3ee2f3205f71d7aae6459ede0622489becd40de1',
  ],
  [
    'packages/inventory-core/src/lib/infrastructure/employee-sql/employee-creation-database-readiness.ts',
    'eda79cce995d59f9f8f1fe517d546facff1bb20c9b5f2c6855b9041968651252',
  ],
  [
    'packages/inventory-core/src/lib/infrastructure/employee-sql/employee-fixed-sql-process.ts',
    'ce90628b0875c9027a6aaba15663f02a61796c7df39abd85cadd49368a6c07b9',
  ],
  [
    'packages/inventory-core/src/lib/infrastructure/employee-sql/employee-fixed-sql-protocol.d.mts',
    'c43942a68d7b1eee6ea1a924051631044f967640dff7616aded9dff6373699fa',
  ],
  [
    'packages/inventory-core/src/lib/infrastructure/employee-sql/employee-fixed-sql-protocol.mjs',
    '1631a85c20df2677ea071e23c60aa14ff599a16ab1751a2e13fa646d19503897',
  ],
  [
    'packages/inventory-core/src/lib/infrastructure/employee-sql/employee-fixed-sql-worker.mjs',
    '24e9fb8f1e1b3e6faf8fe4945a0504c4cefaa7e179a37779b4183f801d0817a2',
  ],
  [
    'packages/inventory-core/src/lib/infrastructure/employee-sql/employee-sql-catalog-readiness.ts',
    'f9359eaf56910426f0403a3fd569efd3221f0e4e3c5b3797068add66480a5542',
  ],
].map(([path, sha256]) => ({ path, sha256 }));
const sourceFile = (path) => {
  const found = sourceFiles.find((entry) => entry.path === path);
  if (!found) throw failure();
  return { ...found };
};
const migrations = [
  '20261011002107_employee_creation_identity.sql',
  '20261011002108_employee_creation_finalization.sql',
  '20261011002109_employee_restoration.sql',
  '20261016093001_employee_creation_operations.sql',
  '20261016093002_employee_creation_reserved_preflight.sql',
].map((file) => sourceFile(`apps/database/supabase/migrations/${file}`));
const packets = [
  ['employee-signup-guards.sql', 25, 'foundation'],
  ['employee-administrator.sql', 20, 'foundation'],
  ['employee-finalization.sql', 34, 'foundation'],
  ['employee-identity-contract.sql', 52, 'foundation'],
  ['employee-restoration.sql', 41, 'foundation'],
  ['employee-creation-operations.sql', 48, 'additional'],
  ['employee-creation-reserved-preflight.sql', 61, 'additional'],
].map(([file, assertions, group]) => ({
  file,
  assertions,
  group,
  sha256: sourceFile(`apps/database/supabase/tests/${file}`).sha256,
}));
const profile = freeze({
  name: profileName,
  baseSourceSha,
  sourceFiles,
  migrations,
  packets,
});

/** Only explicit composed selection; the original foundation profile is untouched. */
export function selectEmployeeComposedProfile(name) {
  if (name !== profileName) throw failure();
  return profile;
}
function exactKeys(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key))
  )
    throw failure();
}
function assertFiles(actual, expected) {
  if (!Array.isArray(actual) || actual.length !== expected.length)
    throw failure();
  for (let index = 0; index < expected.length; index++) {
    const row = actual[index],
      wanted = expected[index];
    exactKeys(row, ['path', 'sha256']);
    if (row.path !== wanted.path || row.sha256 !== wanted.sha256)
      throw failure();
  }
}
/** Validate supplied source metadata. Root must independently establish the real
 * remote commit and observed file bytes. This function cannot inspect Git or SQL. */
export function validateEmployeeComposedManifest(manifest, expectedSourceSha) {
  if (
    typeof expectedSourceSha !== 'string' ||
    !/^[a-f0-9]{40}$/u.test(expectedSourceSha) ||
    expectedSourceSha === '0'.repeat(40) ||
    expectedSourceSha === baseSourceSha
  )
    throw failure();
  exactKeys(manifest, [
    'profile',
    'baseSourceSha',
    'sourceSha',
    'files',
    'migrations',
  ]);
  selectEmployeeComposedProfile(manifest.profile);
  if (
    manifest.baseSourceSha !== baseSourceSha ||
    manifest.sourceSha !== expectedSourceSha
  )
    throw failure();
  assertFiles(manifest.files, profile.sourceFiles);
  assertFiles(manifest.migrations, profile.migrations);
  return freeze({
    profile: profileName,
    baseSourceSha,
    sourceSha: expectedSourceSha,
    sourceManifestSha256: sha256(
      JSON.stringify({
        profile: profileName,
        baseSourceSha,
        sourceSha: expectedSourceSha,
        files: profile.sourceFiles,
        migrations: profile.migrations,
      })
    ),
  });
}
function assertTranscript(tap, count) {
  if (
    typeof tap !== 'string' ||
    Buffer.byteLength(tap, 'utf8') > 1024 * 1024 ||
    /#\s*(?:SKIP|TODO)\b/iu.test(tap)
  )
    throw failure();
  assertPacketTap(tap, count);
  const lines = tap.trim().split(/\r?\n/u);
  const transactions = lines.filter((line) =>
    /^\s*(?:BEGIN|ROLLBACK|COMMIT|ABORT|END)\s*;?\s*$/iu.test(line)
  );
  if (
    lines[0] !== 'BEGIN' ||
    lines.at(-1) !== 'ROLLBACK' ||
    transactions.length !== 2 ||
    transactions[0] !== 'BEGIN' ||
    transactions[1] !== 'ROLLBACK'
  )
    throw failure();
}
/** Parse supplied transcripts only. There is deliberately no external receipt
 * admission API; even complete synthetic TAP cannot qualify schema or delivery. */
export function evaluateEmployeeComposedPackets(input, expectedSourceSha) {
  exactKeys(input, ['manifest', 'packets']);
  const binding = validateEmployeeComposedManifest(
    input.manifest,
    expectedSourceSha
  );
  if (
    !Array.isArray(input.packets) ||
    input.packets.length !== profile.packets.length
  )
    throw failure();
  const observed = profile.packets.map((packet, index) => {
    const actual = input.packets[index];
    exactKeys(actual, ['file', 'sourceSha', 'sha256', 'exitCode', 'tap']);
    if (
      actual.file !== packet.file ||
      actual.sourceSha !== expectedSourceSha ||
      actual.sha256 !== packet.sha256 ||
      actual.exitCode !== 0
    )
      throw failure();
    assertTranscript(actual.tap, packet.assertions);
    return { ...packet, transcriptSha256: sha256(actual.tap) };
  });
  return freeze({
    ...binding,
    packetTranscriptValidated: true,
    foundationAssertions: observed
      .filter((p) => p.group === 'foundation')
      .reduce((n, p) => n + p.assertions, 0),
    additionalAssertions: observed
      .filter((p) => p.group === 'additional')
      .reduce((n, p) => n + p.assertions, 0),
    assertions: observed.reduce((n, p) => n + p.assertions, 0),
    packets: observed,
    schemaQualified: false,
    typesQualified: false,
    consumerQualified: false,
    catalogQualified: false,
    tlsQualified: false,
    commitQualified: false,
    racesQualified: false,
    runtimeQualified: false,
    combinedQualified: false,
    accountQualified: false,
    providerQualified: false,
    productionApplied: false,
    actualCatalogDefinitionHash: null,
    generatedTypesSha256: null,
  });
}
