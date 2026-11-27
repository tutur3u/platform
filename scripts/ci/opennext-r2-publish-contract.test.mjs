// Workflow contract for the serialized R2 incremental-cache population.
// The 13 Nov 2026 Lettin deploy (run 43376283765, on 8b76c715) ran the
// OpenNext deploy without --cacheChunkSize, so population used the default of
// 25 concurrent R2 writes. Each write hit the 60 s request abort and the
// population failed after 15 attempts. The fixture harness in
// opennext-r2-population.test.mjs proves the CLI honors the flag; this file
// proves the publishers still pass it, and only with the value 1.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import nodeTest from 'node:test';
import path from 'node:path';
import url from 'node:url';

const repository = path.resolve(
  path.dirname(url.fileURLToPath(import.meta.url)),
  '../..'
);
const read = (relative) =>
  fs.readFileSync(path.join(repository, relative), 'utf8');

const publishers = [
  {
    workflow: '.github/workflows/lettin-cloudflare.yaml',
    directory: 'apps/lettin',
  },
];

const deployLine = /\bdeploy:cloudflare --(?=\s)/;

function deployInvocations(source) {
  return source
    .split('\n')
    .filter((line) => deployLine.test(line))
    .map((line) => line.trim());
}

for (const { workflow, directory } of publishers) {
  nodeTest(`${workflow} serializes the R2 cache population`, () => {
    const invocations = deployInvocations(read(workflow));
    assert.equal(
      invocations.length,
      1,
      `${workflow} must have exactly one OpenNext deploy invocation`
    );
    assert.match(
      invocations[0],
      /deploy:cloudflare -- --cacheChunkSize 1 --message "\$GITHUB_SHA"/,
      `${workflow} must pass --cacheChunkSize 1 before --message`
    );
    assert.equal(
      invocations[0].split('--cacheChunkSize').length - 1,
      1,
      `${workflow} must pass --cacheChunkSize exactly once`
    );
    assert.ok(
      fs.existsSync(path.join(repository, directory, 'package.json')),
      `${directory} must exist`
    );
  });
}

nodeTest('every OpenNext cache-size override is exactly 1', () => {
  const workflows = fs
    .readdirSync(path.join(repository, '.github/workflows'))
    .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'));
  for (const name of workflows) {
    const relative = `.github/workflows/${name}`;
    for (const line of read(relative).split('\n')) {
      if (!line.includes('cacheChunkSize')) continue;
      assert.equal(
        line.split('cacheChunkSize').length - 1,
        1,
        `${relative} sets the cache chunk size more than once: ${line.trim()}`
      );
      assert.match(
        line,
        /--cacheChunkSize 1(?=\s|$)/,
        `${relative} sets a cache chunk size other than 1: ${line.trim()}`
      );
    }
  }
});

nodeTest(
  'the Lettin deploy step is the only publisher of the verified Worker',
  () => {
    const source = read('.github/workflows/lettin-cloudflare.yaml');
    const deployStep = source.indexOf('- name: Deploy verified Worker');
    const verifyStep = source.indexOf(
      '- name: Verify deployed storage and version'
    );
    assert.ok(deployStep > 0 && verifyStep > deployStep);
    const between = source.slice(deployStep, verifyStep);
    assert.match(between, /--cacheChunkSize 1/);
    assert.match(between, /--tag "\$GITHUB_SHA"/);
  }
);
