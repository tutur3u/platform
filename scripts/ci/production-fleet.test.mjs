/**
 * The production fleet registry covers every app directory, agrees with the
 * planner deny-list and the publication policy, and classes the serving
 * Workers auto. A new app directory without an entry fails here, so it can
 * never be left out of production publication silently.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import test from 'node:test';
import { PRODUCTION_FLEET, registryProblems } from './production-fleet.mjs';
import { SERVING_WORKERS } from './serving-workers-apps.mjs';

const root = new URL('../../', import.meta.url);
const appDirs = readdirSync(new URL('apps/', root), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

function holds() {
  const out = execFileSync(
    'bun',
    [
      '--eval',
      `import { productionAppExclusions, productionPublicationPolicy } from './tuturuuu.ci.ts';
       console.log(JSON.stringify({
         excluded: Object.keys(productionAppExclusions),
         policyHeld: Object.entries(productionPublicationPolicy)
           .filter(([, entry]) => entry.state === 'held').map(([app]) => app),
       }));`,
    ],
    { cwd: root, encoding: 'utf8' }
  );
  return JSON.parse(out.trim().split('\n').at(-1));
}

test('the registry covers every app directory and agrees with the holds', () => {
  assert.deepEqual(registryProblems({ appDirs, ...holds() }), []);
});

test('the fleet keeps the deliberate publication holds', () => {
  const held = Object.entries(PRODUCTION_FLEET)
    .filter(([, entry]) => entry.class === 'held')
    .map(([app]) => app)
    .sort();
  assert.deepEqual(held, [
    'colab',
    'contacts',
    'drive',
    'lettin',
    'mind',
    'parley',
    'track',
    'whiteboards',
  ]);
});

test('auto is exactly the serving Workers', () => {
  const auto = Object.entries(PRODUCTION_FLEET)
    .filter(([, entry]) => entry.class === 'auto')
    .map(([app]) => app)
    .sort();
  assert.deepEqual(auto, Object.keys(SERVING_WORKERS).sort());
});

test('broken variants are caught', () => {
  const base = {
    appDirs,
    excluded: ['lettin', 'parley', 'colab', 'mind', 'track'],
    policyHeld: ['contacts', 'drive', 'whiteboards'],
  };
  assert.match(
    registryProblems({ ...base, appDirs: [...appDirs, 'brand-new'] }).join(),
    /apps\/brand-new has no production fleet entry/
  );
  assert.match(
    registryProblems({ ...base, excluded: [...base.excluded, 'mail'] }).join(),
    /mail: held in tuturuuu.ci.ts but not in the fleet/
  );
  assert.match(
    registryProblems({ ...base, excluded: ['lettin', 'parley'] }).join(),
    /colab: held in the fleet but published by the planner/
  );
  assert.match(
    registryProblems({
      ...base,
      appDirs: appDirs.filter((dir) => dir !== 'mail'),
    }).join(),
    /mail has a fleet entry but no apps\/mail directory/
  );
});
