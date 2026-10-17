const assert = require('node:assert/strict');
const test = require('node:test');
function pipelineTests(pipeline) {
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
