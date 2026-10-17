import {
  assertCatalogRestored,
  assertCausalGreen,
  assertExpectedRed,
  assertReady,
  catalogSQL,
  preflightSQL,
  readCatalog,
} from './product-feedback-causal-controls.mjs';

export function runFeedbackCausalPhase(state, runSQL, remaining) {
  const { inventory } = state;
  state.phase = 'preflight';
  assertReady(runSQL(preflightSQL, remaining(10000)));
  state.phase = 'baseline-catalog';
  state.baseline = readCatalog(
    runSQL(catalogSQL, remaining(10000)),
    inventory.bodySha256
  );
  for (const [index, variant] of inventory.variants.entries()) {
    const row = {
      id: variant.id,
      sqlSha256: variant.sqlSha256,
      failedOrdinals: [],
      red: false,
      catalogRestored: false,
      green: false,
    };
    state.observations.push(row);
    state.phase = 'red';
    const red = assertExpectedRed(
      runSQL(variant.sql, remaining()),
      variant.failedOrdinals
    );
    row.failedOrdinals = red.failedOrdinals;
    row.red = true;
    state.phase = 'red-catalog';
    assertCatalogRestored(
      state.baseline,
      readCatalog(runSQL(catalogSQL, remaining(10000)), inventory.bodySha256)
    );
    row.catalogRestored = true;
    if (index < inventory.variants.length - 1) {
      state.phase = 'restored-green';
      assertCausalGreen(runSQL(inventory.fixture, remaining()));
      state.phase = 'green-catalog';
      assertCatalogRestored(
        state.baseline,
        readCatalog(runSQL(catalogSQL, remaining(10000)), inventory.bodySha256)
      );
      row.green = true;
    }
  }
}
export function finishFeedbackCausalPhase(state, runSQL, remaining) {
  if (
    state.observations.length !== 8 ||
    state.observations.some(
      (row, index) =>
        !row.red || !row.catalogRestored || (index < 7 && !row.green)
    )
  )
    throw new Error('Feedback causal terminal phase denied');
  state.phase = 'terminal-catalog';
  state.finalCatalogSha256 = assertCatalogRestored(
    state.baseline,
    readCatalog(
      runSQL(catalogSQL, remaining(10000)),
      state.inventory.bodySha256
    )
  );
  state.observations.at(-1).green = true;
  state.phase = 'complete';
}
