const assert = require('node:assert/strict');

function assertPackagePreparation({
  workflowName,
  packagePath,
  prepareJob,
  publishJob,
}) {
  if (packagePath === 'packages/sdk') {
    assert.match(prepareJob, /SOURCE_SHA: \$\{\{ github.sha \}\}/);
    assert.match(
      prepareJob,
      /QUALIFICATION_OUTPUT: \$\{\{ runner.temp \}\}\/tuturuuu-sdk-package/
    );
    const qualifyIndex = prepareJob.indexOf(
      'node scripts/ci/qualify-sdk-package.js'
    );
    assert.notEqual(qualifyIndex, -1);
    assert.ok(
      qualifyIndex < prepareJob.indexOf('uses: actions/upload-artifact@')
    );
    assert.doesNotMatch(
      prepareJob,
      /npm pack\b|prepare-npm-package-manifest.js/
    );
    for (const check of [
      /receipt.phase !== 'public'/,
      /receipt.sourceSha !== sourceSha/,
      /receipt.qualified !== true/,
      /pkg\?\.name !== name/,
      /pkg\?\.version !== version/,
      /pkg.archive !== archives\[0\]/,
      /createHash\('sha256'\)/,
      /pkg.sha256/,
    ])
      assert.match(publishJob, check);
    assert.match(publishJob, /PACKAGE_TARBALL=\$\(node <<'NODE'/);
    assert.doesNotMatch(
      publishJob,
      /require\(['"]\.\/|verify-receipt\.cjs|npm pack\b|run build/
    );
    return;
  }
  assert.match(prepareJob, /npm pack --ignore-scripts --pack-destination/);
  const prepareManifestIndex = prepareJob.indexOf(
    `node scripts/ci/prepare-npm-package-manifest.js ${packagePath}`
  );
  const packIndex = prepareJob.indexOf(
    'npm pack --ignore-scripts --pack-destination'
  );
  assert.notEqual(
    prepareManifestIndex,
    -1,
    `${workflowName} must prepare npm package manifests before packing`
  );
  assert.ok(
    prepareManifestIndex < packIndex,
    `${workflowName} must rewrite workspace protocol dependencies before npm pack`
  );
}
module.exports = { assertPackagePreparation };
