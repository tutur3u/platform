const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
function pipelineTests(pipeline) {
  test('published aliases must resolve to the shipped wrapper, not a direct dist entry', async (t) => {
    const { receipt } = await pipeline(t, {
      afterInstall(consumer) {
        const alias = path.join(consumer, 'node_modules/.bin/ttr');
        fs.unlinkSync(alias);
        fs.symlinkSync(
          path.join(consumer, 'node_modules/tuturuuu/dist/cli/index.js'),
          alias
        );
      },
    });
    assert.equal(receipt.qualified, false);
    assert.equal(receipt.blocker.code, 'BIN_RESOLUTION_FAILED');
    assert.equal(receipt.temporaryFixtureDrained, true);
  });
  test('PUBLIC compares registry integrity against the actual nested package lock', async (t) => {
    const name = '@tuturuuu/unpublished',
      version = '1.2.3';
    const integrity = 'sha512-YWJj';
    for (const actualIntegrity of [integrity, 'sha512-ZGVm']) {
      const { receipt } = await pipeline(t, {
        manifest: { dependencies: { [name]: 'workspace:*' } },
        registryTuple: { name, version, dist: { integrity } },
        afterInstall(consumer) {
          const key = `node_modules/tuturuuu/node_modules/${name}`;
          const directory = path.join(consumer, key);
          fs.mkdirSync(directory, { recursive: true });
          fs.writeFileSync(
            path.join(directory, 'package.json'),
            JSON.stringify({ name, version })
          );
          const file = path.join(consumer, 'package-lock.json');
          const lock = JSON.parse(fs.readFileSync(file, 'utf8'));
          lock.packages[key] = {
            version,
            integrity: actualIntegrity,
            resolved:
              'https://registry.npmjs.org/@tuturuuu/unpublished/-/unpublished-1.2.3.tgz',
          };
          // A valid unrelated hoisted tuple must not hide a nested integrity mismatch.
          lock.packages[`node_modules/${name}`] = {
            ...lock.packages[key],
            integrity,
          };
          fs.writeFileSync(file, JSON.stringify(lock));
        },
      });
      assert.equal(
        receipt.qualified,
        actualIntegrity === integrity,
        JSON.stringify(receipt.blocker)
      );
      if (actualIntegrity !== integrity)
        assert.equal(receipt.blocker.code, 'REGISTRY_TUPLE_MISMATCH');
      assert.equal(receipt.temporaryFixtureDrained, true);
    }
  });
  test('generated release SOURCE breaks registry cycle but never issues public acceptance', async (t) => {
    const manifest = {
      dependencies: { '@tuturuuu/unpublished': 'workspace:*' },
    };
    const source = await pipeline(t, { phase: 'source', manifest });
    assert.equal(source.receipt.sourceValidated, true);
    assert.equal(source.receipt.qualified, false);
    assert.equal(source.receipt.phase, 'source');
    assert.equal(source.receipt.package.name, 'tuturuuu');
    assert.equal(
      source.commands.some(
        ([cmd, args]) => cmd === 'npm' && ['view', 'install'].includes(args[0])
      ),
      false
    );
    const ordinary = await pipeline(t, { manifest });
    assert.equal(ordinary.receipt.qualified, false);
    assert.equal(
      ordinary.receipt.blocker.code,
      'REGISTRY_DEPENDENCY_UNAVAILABLE'
    );
    assert.equal(
      ordinary.commands.some(([, args]) => args[0] === 'pack'),
      false
    );
    const invalidPack = await pipeline(t, {
      phase: 'source',
      manifest,
      packName: 'foreign',
    });
    assert.equal(invalidPack.receipt.sourceValidated, false);
  });
  test('missing runtime, peer or optional dependency hard-fails PUBLIC; embedded dev-only is ignored', async (t) => {
    for (const field of [
      'dependencies',
      'peerDependencies',
      'optionalDependencies',
    ]) {
      const { receipt, commands } = await pipeline(t, {
        manifest: { [field]: { '@tuturuuu/unpublished': 'workspace:*' } },
      });
      assert.equal(
        receipt.blocker.code,
        'REGISTRY_DEPENDENCY_UNAVAILABLE',
        field
      );
      assert.equal(receipt.qualified, false);
      assert.equal(
        commands.some(([, args]) => args[0] === 'install'),
        false
      );
    }
    const { receipt, commands } = await pipeline(t, {
      manifest: { devDependencies: { '@tuturuuu/unpublished': 'workspace:*' } },
    });
    assert.equal(receipt.qualified, true, JSON.stringify(receipt.blocker));
    assert.equal(
      commands.some(([, args]) => args[0] === 'view'),
      false
    );
    assert.equal(receipt.controls.length, 14);
  });
}
module.exports = { pipelineTests };
