import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import {
  defaultComparisons,
  parseConfigData,
  probeDecision,
} from './native-config-default-probe.mjs';

function baseline() {
  const input = { name: 'fixture' };
  const config = {
    configPath: 'materialized',
    userConfigPath: 'materialized',
    topLevelName: 'fixture',
    jsx_factory: 'React.createElement',
    jsx_fragment: 'React.Fragment',
    durable_objects: { bindings: [] },
    queues: { producers: [], consumers: [] },
    logfwdr: { bindings: [] },
    python_modules: { exclude: ['**/*.pyc'] },
    upload_source_maps: true,
    dev: {
      ip: 'localhost',
      local_protocol: 'http',
      upstream_protocol: 'http',
      enable_containers: true,
      generate_types: false,
    },
  };
  const facts = {
    inputKnown: true,
    inputPath: 'materialized',
    source: {},
    sourceKnown: true,
    supplierProfileMatches: true,
    parserProfileMatches: true,
    loaderProven: true,
    configPathEqualsInput: true,
    userConfigPathEqualsInput: true,
    topLevelNameEqualsInput: true,
    definedEnvironmentsEqualsInput: true,
    stateValid: true,
    stateMatchesInput: true,
    stateTextEqualsInput: true,
  };
  return { config, input, facts };
}
const decide = (f) => probeDecision(f.config, f.input, f.facts);
const row = (probe, name) => probe.fields.find((field) => field.name === name);

test('otherwise-ready pure baseline records eleven exact candidates and unknown causation', () => {
  const probe = decide(baseline());
  assert.equal(probe.fields.length, 11);
  assert.equal(probe.status, 'recorded');
  assert.equal(probe.reason, 'value_candidates_only');
  assert.equal(probe.diagnosticOnly, true);
  assert.equal(probe.causalProvenance.status, 'unknown');
  assert.ok(probe.evidence.every((item) => item.status === 'matched'));
  for (const field of probe.fields) {
    assert.equal(field.status, 'recorded');
    assert.equal(field.nestedKeysMatch, true);
    assert.equal(field.typesMatch, true);
    assert.equal(field.candidateMatch, true);
    assert.equal(field.authoredPresent, null);
  }
});

for (const [fact, name, reason] of [
  ['supplierProfileMatches', 'supplier', 'supplier_profile'],
  ['parserProfileMatches', 'parser', 'parser_profile'],
  ['loaderProven', 'loader', 'loader_selection'],
  ['configPathEqualsInput', 'configPath', 'metadata_config_path'],
  ['userConfigPathEqualsInput', 'userConfigPath', 'metadata_user_config_path'],
  ['topLevelNameEqualsInput', 'topLevelName', 'metadata_top_level_name'],
  ['definedEnvironmentsEqualsInput', 'environments', 'metadata_environments'],
  ['stateValid', 'stateShape', 'retained_state_shape'],
  ['stateMatchesInput', 'stateResolved', 'retained_state_resolved'],
  ['stateTextEqualsInput', 'stateText', 'retained_state_text'],
]) {
  for (const value of [false, null])
    test(`${fact}=${value} changes only its evidence row`, () => {
      const f = baseline();
      f.facts[fact] = value;
      const probe = decide(f);
      const expected = value === false ? 'mismatch' : 'unknown';
      for (const item of probe.evidence) {
        assert.equal(item.status, item.name === name ? expected : 'matched');
        if (item.name === name)
          assert.equal(item.reason, `${reason}_${expected}`);
      }
      assert.equal(probe.status, 'recorded');
      for (const field of probe.fields) {
        assert.equal(field.status, 'recorded');
        assert.equal(field.candidateMatch, true);
      }
    });
}

test('missing input makes each value row unavailable with its exact reason', () => {
  const f = baseline();
  f.facts.inputKnown = false;
  const probe = decide(f);
  assert.equal(probe.status, 'unavailable');
  for (const field of probe.fields) {
    assert.equal(field.status, 'unavailable');
    assert.equal(field.reason, 'materialized_input_unavailable');
    assert.equal(field.candidateMatch, null);
    assert.equal(field.inputPresent, null);
  }
  assert.ok(probe.evidence.every((item) => item.status === 'matched'));
});

test('missing name affects only the name candidate', () => {
  const f = baseline();
  delete f.input.name;
  const probe = decide(f);
  assert.equal(row(probe, 'topLevelName').reason, 'input_name_unavailable');
  for (const field of probe.fields)
    assert.equal(
      field.status,
      field.name === 'topLevelName' ? 'unavailable' : 'recorded'
    );
});

test('each changed emitted value affects exactly its candidate row', () => {
  for (const field of decide(baseline()).fields)
    for (const value of [null, 'changed', { extra: [] }]) {
      const f = baseline();
      f.config[field.name] = value;
      const probe = decide(f);
      for (const actual of probe.fields) {
        assert.equal(actual.status, 'recorded');
        assert.equal(actual.candidateMatch, actual.name !== field.name);
      }
    }
});

test('both pinned platform branches are candidates, not historical platform proof', () => {
  const f = baseline();
  let probe = decide(f);
  assert.deepEqual(
    row(probe, 'dev').candidates.map((c) => c.exactValueMatch),
    [true, false]
  );
  f.config.dev.ip = '127.0.0.1';
  probe = decide(f);
  assert.deepEqual(
    row(probe, 'dev').candidates.map((c) => c.exactValueMatch),
    [false, true]
  );
  assert.equal(probe.causalProvenance.normalizerPlatformProven, false);
  f.config.dev.ip = 'other';
  assert.equal(row(decide(f), 'dev').candidateMatch, false);
});

test('explicit source-map true compares as an emitted candidate, never intrinsic default', () => {
  const f = baseline();
  f.input.upload_source_maps = true;
  f.facts.source = { upload_source_maps: true };
  const field = row(decide(f), 'upload_source_maps');
  assert.equal(field.status, 'recorded');
  assert.equal(field.inputPresent, true);
  assert.equal(field.retainedSourcePresent, true);
  assert.equal(field.authoredPresent, null);
  assert.equal(field.origin, 'materialized_input');
  assert.equal(field.candidates[0].candidate, 'emitted_true_candidate');
  assert.equal(field.candidateMatch, true);
});

test('absent retained source leaves presence unknown without hiding comparisons', () => {
  const f = baseline();
  f.facts.sourceKnown = false;
  const fields = defaultComparisons(f.config, f.input, f.facts);
  for (const field of fields) {
    assert.equal(field.retainedSourcePresent, null);
    assert.equal(field.authoredPresent, null);
    assert.equal(field.candidateMatch, true);
  }
});

test('recursive extras, real bindings and wrong element types discriminate', () => {
  for (const name of [
    'durable_objects',
    'queues',
    'logfwdr',
    'python_modules',
    'dev',
  ]) {
    const f = baseline();
    f.config[name].extra = [];
    const probe = decide(f);
    assert.equal(row(probe, name).nestedKeysMatch, false);
    assert.equal(row(probe, name).candidateMatch, false);
    for (const field of probe.fields.filter((item) => item.name !== name))
      assert.equal(field.candidateMatch, true);
  }
  const f = baseline();
  f.config.queues.producers.push({ binding: 'private-fixture' });
  assert.equal(row(decide(f), 'queues').candidateMatch, false);
  f.config.python_modules.exclude = [false];
  assert.equal(row(decide(f), 'python_modules').typesMatch, false);
});

// Parser loading in this authored test follows the installed Void dependency edge.
const ownerRequire = createRequire(
  new URL('../../apps/meet/package.json', import.meta.url)
);
const voidEntry = realpathSync(ownerRequire.resolve('void'));
const parserRequire = createRequire(voidEntry);
const parserPackage = JSON.parse(
  readFileSync(parserRequire.resolve('jsonc-parser/package.json'))
);
const { parse } = parserRequire('jsonc-parser');

test('declared parser public API accepts comments and trailing commas without recovery', () => {
  assert.equal(parserPackage.version, '3.3.1');
  const raw = Buffer.from(
    '// provenance\n{ /* retained */ "name": "fixture", "env": {}, }'
  );
  assert.deepEqual(parseConfigData(raw, parse), {
    input: { name: 'fixture', env: {} },
  });
});
for (const raw of [
  '{ "name":, }',
  '{"name":"fixture"} {}',
  '{"name":"fixture"} junk',
  '/* open',
  '',
]) {
  test('malformed JSONC and trailing content never become recovered candidates', () => {
    const result = parseConfigData(Buffer.from(raw), parse);
    assert.equal(result.reason, 'materialized_parse_errors');
    assert.equal(result.input, undefined);
  });
}
for (const raw of ['null', '[]', 'true', '"text"'])
  test('nonobject JSONC cannot supply config facts', () => {
    assert.equal(
      parseConfigData(Buffer.from(raw), parse).reason,
      'materialized_shape_unavailable'
    );
  });
