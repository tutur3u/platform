import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  observeEmployeeConsumerFiles,
  observeEmployeeSourceCommit,
} from './employee-schema-composed-consumers.mjs';
import { selectEmployeeComposedProfile } from './employee-schema-composed-profile.mjs';
import {
  assertPacketTap,
  exactSourceSha,
  foundationPackets,
  schemaFailureDiagnostic,
  schemaReceipt,
} from './employee-schema-tap.mjs';

export const qualificationControlPaths = Object.freeze([
  '.github/workflows/employee-schema-contract.yaml',
  'apps/database/scripts/verify-employee-schema-contract.mjs',
  'apps/database/scripts/employee-schema-qualification-profile.mjs',
  'apps/database/scripts/employee-schema-composed-consumers.mjs',
  'apps/database/scripts/employee-schema-composed-profile.mjs',
  'apps/database/scripts/employee-schema-typegen.mjs',
  'apps/database/scripts/employee-schema-tap.mjs',
  'apps/database/scripts/programming-database-tap.mjs',
  'apps/database/scripts/employee-schema-network.mjs',
  'apps/database/scripts/employee-schema-network-proof.mjs',
  'apps/database/scripts/employee-schema-loopback-relay.mjs',
  'apps/database/scripts/employee-schema-start-evidence.mjs',
  'apps/database/scripts/run-supabase.js',
  'apps/database/scripts/run-supabase-isolated.js',
]);
const denied = () => new Error('Employee qualification source binding denied');
export const employeeQualificationHash = (value) =>
  createHash('sha256').update(value).digest('hex');
export function observedEmployeeFile(root, file) {
  if (
    path.isAbsolute(file) ||
    file.split('/').some((part) => part === '..' || !part)
  )
    throw denied();
  let current = root;
  for (const part of file.split('/')) {
    current = path.join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw denied();
  }
  if (!lstatSync(current).isFile()) throw denied();
  return {
    path: file,
    sha256: employeeQualificationHash(readFileSync(current)),
  };
}
export function selectEmployeeQualificationProfile(
  choice,
  sourceSha = reviewedAuthSourceChain.sourceSha
) {
  if (choice === 'foundation')
    return Object.freeze({
      name: 'employee-creation-foundation-v1',
      choice,
      packets: foundationPackets.map(([file, assertions]) =>
        Object.freeze({ file, assertions })
      ),
      assertions: 172,
    });
  if (choice !== 'composed') throw denied();
  const chain =
    sourceSha === reviewedMarkerSourceChain.sourceSha
      ? reviewedMarkerSourceChain
      : reviewedAuthSourceChain;
  if (sourceSha !== chain.sourceSha) throw denied();
  return Object.freeze({
    ...selectEmployeeComposedProfile('employee-creation-composed-v1'),
    name: chain.profile,
    sourceFiles: Object.freeze(
      selectEmployeeComposedProfile(
        'employee-creation-composed-v1'
      ).sourceFiles.map((row) =>
        row.path === reviewedMarkerSourceChain.delta.path
          ? Object.freeze({
              ...row,
              sha256: reviewedMarkerSourceChain.delta.afterSha256,
            })
          : row.path === 'bun.lock' && chain === reviewedAuthSourceChain
            ? Object.freeze({
                ...row,
                sha256: reviewedAuthSourceChain.files.find(
                  (file) => file.path === row.path
                ).sha256,
              })
            : row
      )
    ),
    choice,
    assertions: 281,
  });
}
/** No import-time effects. Every manifest row is hashed from the selected checkout. */
export function observeEmployeeQualification({
  repositoryRoot,
  choice,
  sourceSha,
  observedSourceSha,
  gitIdentity,
  authoritativeSourceSha,
  controlFiles,
  expectedControlFiles,
}) {
  const selected = selectEmployeeQualificationProfile(choice, sourceSha);
  exactSourceSha(sourceSha);
  if (
    !Array.isArray(controlFiles) ||
    !Array.isArray(expectedControlFiles) ||
    controlFiles.length !== qualificationControlPaths.length ||
    expectedControlFiles.length !== qualificationControlPaths.length ||
    controlFiles.some(
      (row, index) =>
        Object.keys(row).sort().join(',') !== 'path,sha256' ||
        Object.keys(expectedControlFiles[index] ?? {})
          .sort()
          .join(',') !== 'path,sha256' ||
        row.path !== qualificationControlPaths[index] ||
        row.sha256 !== expectedControlFiles[index]?.sha256 ||
        expectedControlFiles[index]?.path !== row.path ||
        !/^[a-f0-9]{64}$/.test(row.sha256)
    )
  )
    throw denied();
  const controlManifestSha256 = employeeQualificationHash(
    JSON.stringify(controlFiles)
  );
  if (choice === 'foundation')
    return {
      selected,
      sourceSha,
      manifest: null,
      consumers: null,
      controlManifestSha256,
    };
  if (
    authoritativeSourceSha !== sourceSha ||
    observedSourceSha !== sourceSha ||
    sourceSha === '68a47c83c4ecc40f422749a6dd288b82a75441d6'
  )
    throw denied();
  const chain =
    selected.name === reviewedAuthSourceChain.profile
      ? reviewedAuthSourceChain
      : reviewedMarkerSourceChain;
  const authFiles =
    chain === reviewedAuthSourceChain
      ? chain.files.map(({ path: file }) =>
          observedEmployeeFile(repositoryRoot, file)
        )
      : [];
  const manifest = {
    profile: selected.name,
    baseSourceSha: selected.baseSourceSha,
    sourceSha,
    sourceChain: chain,
    files: selected.sourceFiles.map(({ path: file }) =>
      observedEmployeeFile(repositoryRoot, file)
    ),
    migrations: selected.migrations.map(({ path: file }) =>
      observedEmployeeFile(repositoryRoot, file)
    ),
  };
  if (chain === reviewedAuthSourceChain) manifest.authFiles = authFiles;
  const validator =
    chain === reviewedAuthSourceChain
      ? validateEmployeeReviewedAuthManifest
      : validateEmployeeReviewedMarkerManifest;
  const binding = validator(manifest, authoritativeSourceSha, gitIdentity);
  const consumers = observeEmployeeConsumerFiles(repositoryRoot);
  const profileFiles = [];
  for (const [file, hash] of [
    [
      'apps/database/scripts/employee-schema-composed-profile.mjs',
      'b00ae6f3f48f71dfd48a83f21c8de1765236b26f9c4032f77e5b361b4aca0b25',
    ],
    [
      'apps/database/scripts/employee-schema-composed-profile.test.mjs',
      '47f820933c8ede8f03e16b61829f269171643af2c797b9c39073c10d22bf176f',
    ],
  ]) {
    const observed = observedEmployeeFile(repositoryRoot, file);
    if (observed.sha256 !== hash) throw denied();
    profileFiles.push(observed);
  }
  const closure = [
    ...manifest.files,
    ...profileFiles,
    ...consumers.files,
    ...authFiles,
  ];
  const unique = new Map();
  for (const row of closure) {
    if (unique.has(row.path) && unique.get(row.path).sha256 !== row.sha256)
      throw denied();
    unique.set(row.path, row);
  }
  if (unique.size !== (chain === reviewedAuthSourceChain ? 52 : 47))
    throw denied();
  const fullSourceManifest = {
    sourceSha,
    sourceChain: chain,
    files: [...unique.values()],
  };
  return {
    selected,
    manifest,
    gitIdentity,
    consumers,
    ...binding,
    profileSourceManifestSha256: binding.sourceManifestSha256,
    fullSourceManifest,
    sourceManifestSha256: employeeQualificationHash(
      JSON.stringify(fullSourceManifest)
    ),
    controlManifestSha256,
  };
}
/** Reobserve every selected source row before admitting the compiler receipt. */
export function assertEmployeeQualificationUnchanged(input, observation) {
  if (
    JSON.stringify(observeEmployeeQualification(input)) !==
    JSON.stringify(observation)
  )
    throw denied();
}
export function evaluateEmployeeQualificationPackets(
  observation,
  packets,
  lifecycleCode,
  cleanupSucceeded
) {
  if (observation.selected.choice === 'foundation')
    return schemaReceipt({
      sourceSha: observation.sourceSha,
      packets: packets.map(({ file, assertions }) => ({ file, assertions })),
      lifecycleCode,
      cleanupSucceeded,
    });
  const evaluate =
    observation.selected.name === reviewedAuthSourceChain.profile
      ? evaluateEmployeeReviewedAuthPackets
      : evaluateEmployeeReviewedMarkerPackets;
  return evaluate(
    {
      manifest: observation.manifest,
      packets: packets.map(({ file, sourceSha, sha256, exitCode, tap }) => ({
        file,
        sourceSha,
        sha256,
        exitCode,
        tap,
      })),
    },
    observation.manifest.sourceSha,
    observation.gitIdentity
  );
}

export function employeeQualificationExecutionReceipt(
  observation,
  packets,
  lifecycleCode,
  cleanupSucceeded
) {
  let packetReceipt;
  try {
    packetReceipt = evaluateEmployeeQualificationPackets(
      observation,
      packets,
      lifecycleCode,
      cleanupSucceeded
    );
  } catch {
    packetReceipt = {
      sourceSha: observation.manifest?.sourceSha ?? observation.sourceSha,
      schemaQualified: false,
      typesQualified: false,
      consumerQualified: false,
      catalogQualified: false,
      assertions: packets.reduce((n, p) => n + p.assertions, 0),
      packetTranscriptValidated: false,
      packets: packets.map(({ file, assertions }) => ({ file, assertions })),
    };
  }
  return packetReceipt;
}

function freezeReviewed(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeReviewed(child);
    Object.freeze(value);
  }
  return value;
}
// Closed source authorization, not evidence of SQL, type generation or compilation.
export const reviewedMarkerSourceChain = freezeReviewed({
  profile: 'employee-creation-composed-reviewed-marker-v1',
  parentSha: '794789f41e26d01e9029a3ff92bbbf4f1e738b25',
  sourceSha: '9224768b9789c525e05b78f9e381949f91267a8f',
  treeSha: '9a0df2d92e53c9513e14ed5e32f131d65c1d25c8',
  delta: {
    path: 'apps/infrastructure/src/lib/internal-accounts/employee-creation-sql.ts',
    beforeSha256:
      '39c56ba036678f09f3ecb3ab9dc743eaa8c1eca4d401d72cad493e1397e57d72',
    afterSha256:
      'd78c8a6681de2fed84eb456baff0734de51032bf93d98a526c2b5a3e17b3c59e',
  },
  provenance: {
    priorManifestSha256:
      '0307579f9926b85a8f7b8acdd7ff841ddb2faa0389878a20900197dc15f604a1',
    priorReviewSha256:
      '336f1c04c536376cef544763f33b4697a99325fb23799e5f9b3e0a87c57007ba',
    markerFreezeSha256:
      'f830fb76ed1d5d02bf69ffa63e64192ecc38a538aaa8742c378269731e3e26d2',
    markerReviewSha256:
      '983555c9513b3085c3868fa151c5a07749fded0b0cc37ad572e448a7b0b0d239',
    successorManifestSha256:
      'c235ef476cb41cc783342ccd85009296e6878eaeb7e1fcc260812f6a59138a82',
  },
});
// Reviewed source/dependency recipe only; no installed runtime or compiler qualification.
export const reviewedAuthSourceChain = freezeReviewed({
  profile: 'employee-creation-composed-reviewed-auth-declaration-v1',
  sourceSha: 'f8696ed991cfa4b6c51bb86d59a93632cb5da2af',
  treeSha: 'df8329077114ab799dd2f4b0a8d30c773574f6a5',
  parentSha: '9224768b9789c525e05b78f9e381949f91267a8f',
  parentAuthorization: reviewedMarkerSourceChain,
  provenance: {
    integratedManifestSha256:
      'a8f5beed59a1e0159d9a662f408ebf4934c6b5984d7165f36f62888b0e9327d6',
    authFreezeSha256:
      '0af76bd86fe4be7b97ad57afc39fc4752934df28e98775cce1b4fe2b32cb6697',
    authReviewSha256:
      '2b1c36745684742ec8d30d99b070a659cb503158264f9687ccc48cb97badf2b8',
    authCheckpointSha256:
      '5a33bb879c5b5f19e42d14e032d1f8cc0a34f0055cd21c48f4568dca9e37f45f',
  },
  files: [
    {
      path: 'package.json',
      change: 'M',
      beforeSha256:
        'f39481cbcf90b0094b48e5243fbd549008a8b3a5aaa8bfe6467de9ebd763fb87',
      sha256:
        '65aadf02ea91c3135361c7e0e7efb905bdc89de35e0449a944a48d5f6ca30d6f',
    },
    {
      path: 'bun.lock',
      change: 'M',
      beforeSha256:
        '2c1db57eae3a77096d1ed000c2fc8bb211e5bf5132f429def3e785e9bd31b378',
      sha256:
        '8a1cd80f6472844aee670160611122a3c6dfdca180eafb3d60fb59d9d307d3dd',
    },
    {
      path: 'patches/@supabase%2Fauth-js@2.117.1.patch',
      change: 'A',
      beforeSha256: null,
      sha256:
        'f98c25782e72caedbfa71a98aba7534bb9e6a33cd814313309993eb113497fde',
    },
    {
      path: 'packages/supabase/type-tests/auth-webauthn-compat.ts',
      change: 'A',
      beforeSha256: null,
      sha256:
        '11160e84a9505663a749d7795daf960649dfc3ced500f5ebde1cb471953e0791',
    },
    {
      path: 'packages/supabase/type-tests/auth-webauthn-compat.tsconfig.json',
      change: 'A',
      beforeSha256: null,
      sha256:
        'ffed6ff385bb1b24c18ca757671e1f6b7485ac03dd02ebaeb2c8be4697609f9f',
    },
    {
      path: 'apps/docs/build/development-tools/development.mdx',
      change: 'M',
      beforeSha256:
        'b5635b41022874dc4534d0bdeb0cd9995b07251c47ff68b1ca3f3bf20109f726',
      sha256:
        '15194aae0f38108c9d156ed5566af579a832180641c5d5710d0ddff7d12869da',
    },
  ],
});
function reviewedKeys(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key))
  )
    throw denied();
}
/** Read the actual commit object; shallow checkouts still carry its tree/parent header. */
export function observeEmployeeGitCommit(repositoryRoot, sourceSha) {
  exactSourceSha(sourceSha);
  return observeEmployeeSourceCommit(
    repositoryRoot,
    sourceSha,
    sourceSha === reviewedAuthSourceChain.sourceSha
      ? reviewedAuthSourceChain.files
      : null
  );
}
export function validateEmployeeReviewedMarkerManifest(
  manifest,
  expectedSourceSha,
  gitIdentity
) {
  reviewedKeys(manifest, [
    'profile',
    'baseSourceSha',
    'sourceSha',
    'sourceChain',
    'files',
    'migrations',
  ]);
  reviewedKeys(gitIdentity, ['sourceSha', 'treeSha', 'parentSha']);
  const original = selectEmployeeComposedProfile(
    'employee-creation-composed-v1'
  );
  const chain = reviewedMarkerSourceChain;
  reviewedKeys(manifest.sourceChain, Object.keys(chain));
  reviewedKeys(manifest.sourceChain.delta, Object.keys(chain.delta));
  reviewedKeys(manifest.sourceChain.provenance, Object.keys(chain.provenance));
  if (
    expectedSourceSha !== chain.sourceSha ||
    manifest.sourceSha !== chain.sourceSha ||
    manifest.profile !== chain.profile ||
    manifest.baseSourceSha !== original.baseSourceSha ||
    !['sourceSha', 'treeSha', 'parentSha'].every(
      (key) => gitIdentity[key] === chain[key]
    ) ||
    JSON.stringify(manifest.sourceChain) !== JSON.stringify(chain)
  )
    throw denied();
  validateReviewedRows(manifest, original, false);
  return freezeReviewed({
    profile: chain.profile,
    sourceSha: chain.sourceSha,
    sourceChainSha256: employeeQualificationHash(JSON.stringify(chain)),
    sourceManifestSha256: employeeQualificationHash(JSON.stringify(manifest)),
  });
}
function validateReviewedRows(manifest, original, auth) {
  for (const [rows, required] of [
    [manifest.files, original.sourceFiles],
    [manifest.migrations, original.migrations],
  ]) {
    if (!Array.isArray(rows) || rows.length !== required.length) throw denied();
    for (let index = 0; index < required.length; index++) {
      reviewedKeys(rows[index], ['path', 'sha256']);
      const expected = required[index];
      // Validate raw observations against an explicit successor recipe. Never rewrite rows for V1.
      const requiredHash =
        expected.path === reviewedMarkerSourceChain.delta.path
          ? reviewedMarkerSourceChain.delta.afterSha256
          : auth && expected.path === 'bun.lock'
            ? reviewedAuthSourceChain.files.find(
                (row) => row.path === expected.path
              ).sha256
            : expected.sha256;
      if (
        rows[index].path !== expected.path ||
        rows[index].sha256 !== requiredHash
      )
        throw denied();
    }
  }
  if (
    original.sourceFiles.find(
      (row) => row.path === reviewedMarkerSourceChain.delta.path
    )?.sha256 !== reviewedMarkerSourceChain.delta.beforeSha256
  )
    throw denied();
}
export function validateEmployeeReviewedAuthManifest(
  manifest,
  expectedSourceSha,
  gitIdentity
) {
  reviewedKeys(manifest, [
    'profile',
    'baseSourceSha',
    'sourceSha',
    'sourceChain',
    'files',
    'migrations',
    'authFiles',
  ]);
  reviewedKeys(gitIdentity, [
    'sourceSha',
    'treeSha',
    'parentSha',
    'parentIdentity',
    'parentDelta',
  ]);
  const chain = reviewedAuthSourceChain;
  const original = selectEmployeeComposedProfile(
    'employee-creation-composed-v1'
  );
  reviewedKeys(manifest.sourceChain, Object.keys(chain));
  reviewedKeys(manifest.sourceChain.provenance, Object.keys(chain.provenance));
  reviewedKeys(
    manifest.sourceChain.parentAuthorization,
    Object.keys(reviewedMarkerSourceChain)
  );
  reviewedKeys(
    manifest.sourceChain.parentAuthorization.delta,
    Object.keys(reviewedMarkerSourceChain.delta)
  );
  reviewedKeys(
    manifest.sourceChain.parentAuthorization.provenance,
    Object.keys(reviewedMarkerSourceChain.provenance)
  );
  if (
    original.sourceFiles.find((row) => row.path === 'bun.lock')?.sha256 !==
    chain.files.find((row) => row.path === 'bun.lock').beforeSha256
  )
    throw denied();
  if (
    expectedSourceSha !== chain.sourceSha ||
    manifest.sourceSha !== chain.sourceSha ||
    manifest.profile !== chain.profile ||
    manifest.baseSourceSha !== original.baseSourceSha ||
    JSON.stringify(manifest.sourceChain) !== JSON.stringify(chain) ||
    !['sourceSha', 'treeSha', 'parentSha'].every(
      (key) => gitIdentity[key] === chain[key]
    )
  )
    throw denied();
  reviewedKeys(gitIdentity.parentIdentity, [
    'sourceSha',
    'treeSha',
    'parentSha',
  ]);
  if (
    !['sourceSha', 'treeSha', 'parentSha'].every(
      (key) =>
        gitIdentity.parentIdentity[key] === reviewedMarkerSourceChain[key]
    )
  )
    throw denied();
  if (
    !Array.isArray(gitIdentity.parentDelta) ||
    gitIdentity.parentDelta.length !== 6 ||
    !Array.isArray(manifest.authFiles) ||
    manifest.authFiles.length !== 6
  )
    throw denied();
  const delta = [...gitIdentity.parentDelta].sort((a, b) =>
    a.path.localeCompare(b.path)
  );
  const required = [...chain.files].sort((a, b) =>
    a.path.localeCompare(b.path)
  );
  for (let index = 0; index < 6; index++) {
    reviewedKeys(delta[index], ['path', 'change', 'beforeSha256', 'sha256']);
    if (
      !['path', 'change', 'beforeSha256', 'sha256'].every(
        (key) => delta[index][key] === required[index][key]
      )
    )
      throw denied();
    reviewedKeys(manifest.authFiles[index], ['path', 'sha256']);
    if (
      manifest.authFiles[index].path !== chain.files[index].path ||
      manifest.authFiles[index].sha256 !== chain.files[index].sha256
    )
      throw denied();
  }
  validateReviewedRows(manifest, original, true);
  return freezeReviewed({
    profile: chain.profile,
    sourceSha: chain.sourceSha,
    sourceChainSha256: employeeQualificationHash(JSON.stringify(chain)),
    sourceManifestSha256: employeeQualificationHash(JSON.stringify(manifest)),
  });
}
export function evaluateEmployeeReviewedMarkerPackets(
  input,
  expectedSourceSha,
  gitIdentity
) {
  return evaluateReviewedPackets(
    input,
    expectedSourceSha,
    gitIdentity,
    validateEmployeeReviewedMarkerManifest
  );
}
export function evaluateEmployeeReviewedAuthPackets(
  input,
  expectedSourceSha,
  gitIdentity
) {
  return evaluateReviewedPackets(
    input,
    expectedSourceSha,
    gitIdentity,
    validateEmployeeReviewedAuthManifest
  );
}
function evaluateReviewedPackets(
  input,
  expectedSourceSha,
  gitIdentity,
  validator
) {
  reviewedKeys(input, ['manifest', 'packets']);
  const binding = validator(input.manifest, expectedSourceSha, gitIdentity);
  const selected = selectEmployeeComposedProfile(
    'employee-creation-composed-v1'
  );
  if (!Array.isArray(input.packets) || input.packets.length !== 7)
    throw denied();
  const packets = selected.packets.map((packet, index) => {
    const actual = input.packets[index];
    reviewedKeys(actual, ['file', 'sourceSha', 'sha256', 'exitCode', 'tap']);
    if (
      actual.file !== packet.file ||
      actual.sourceSha !== expectedSourceSha ||
      actual.sha256 !== packet.sha256 ||
      actual.exitCode !== 0 ||
      typeof actual.tap !== 'string' ||
      Buffer.byteLength(actual.tap) > 1024 * 1024 ||
      /#\s*(?:SKIP|TODO)\b/iu.test(actual.tap)
    )
      throw denied();
    assertPacketTap(actual.tap, packet.assertions);
    const lines = actual.tap.trim().split(/\r?\n/u);
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
      throw denied();
    return {
      ...packet,
      transcriptSha256: employeeQualificationHash(actual.tap),
    };
  });
  return freezeReviewed({
    ...binding,
    packetTranscriptValidated: true,
    assertions: 281,
    foundationAssertions: 172,
    additionalAssertions: 109,
    packets,
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

export const selectedFailureDiagnostic = (phase, ordinal, result = {}) =>
  !['catalog', 'consumer-compile'].includes(phase) &&
  ordinal <= foundationPackets.length
    ? schemaFailureDiagnostic(phase, ordinal, result)
    : {
        phase,
        packetOrdinal: ordinal,
        exitCode: Number.isInteger(result.status) ? result.status : null,
        processError: result.error != null,
        signaled: Boolean(result.signal),
        redacted: true,
      };
