const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { existsSync, readdirSync, readFileSync } = require('node:fs');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const base = pathToFileURL(__filename);

const workflows = new URL('../../.github/workflows/', base);
const parse = (file) =>
  JSON.parse(
    execFileSync(
      'bun',
      [
        '-e',
        'console.log(JSON.stringify(Bun.YAML.parse(await Bun.file(process.argv[1]).text())))',
        file,
      ],
      { encoding: 'utf8' }
    )
  );

test('every active Supabase-starting job uses ECR Public without GHCR login', () => {
  let count = 0;
  for (const name of readdirSync(workflows)) {
    if (!/\.ya?ml$/.test(name)) continue;
    const file = new URL(name, workflows);
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /login-supabase-registry/, name);
    const workflow = parse(file.pathname);
    for (const [id, job] of Object.entries(workflow.jobs ?? {})) {
      const label = `${name}: ${id}`;
      const steps = job.steps ?? [];
      // Docker E2E jobs are deliberately paused by the active-runtime policy.
      if (!job['runs-on'] || String(job.if).includes('false')) continue;
      for (const step of steps) {
        assert.doesNotMatch(
          JSON.stringify(step),
          /docker\s+login\s+ghcr\.io|registry["']?\s*:\s*["']?ghcr\.io/i,
          label
        );
      }
      const startsSupabase = steps.some(
        (step) =>
          /setup-supabase-baseline/.test(step.uses ?? '') ||
          /mail-profile-runtime-setup\.mjs|supabase-baseline\.js prepare|sb:start|supabase start|run-supabase\.js start|apps\/database\/scripts\/verify-[\w-]+\.(?:mjs|js)/.test(
            step.run ?? ''
          )
      );
      if (!startsSupabase && !job.env?.SUPABASE_INTERNAL_IMAGE_REGISTRY)
        continue;
      count++;
      const caches = steps.filter(
        (step) => step.uses === './.github/actions/cache-supabase-images'
      );
      assert.equal(caches.length, 1, label);
      if (id === 'seed-images') {
        assert.match(job.if, /refs\/heads\/main/);
        assert.deepEqual(job.strategy.matrix.profile, [
          'contract',
          'contract-http',
          'full',
        ]);
        assert.equal(caches[0].with['pull-budget-seconds'], '600');
        count--;
        continue;
      }
      const cache = caches[0];
      if (name === 'employee-schema-contract.yaml') {
        assert.equal(cache.with.database, 'source/apps/database');
        assert.match(cache.with.profile, /inputs.include_http/);
      } else
        assert.equal(
          cache.with?.profile ?? 'contract',
          [
            'supabase-baseline.yaml',
            'mail-profile-runtime-contract.yaml',
          ].includes(name)
            ? 'full'
            : 'contract',
          label
        );
      const cacheIndex = steps.indexOf(cache);
      const installIndex = steps.findIndex((step) =>
        /run-with-backoff.sh bun install/.test(step.run ?? '')
      );
      assert.ok(cacheIndex > installIndex && installIndex >= 0, label);

      const env = { ...workflow.env, ...job.env };
      assert.equal(
        env.SUPABASE_INTERNAL_IMAGE_REGISTRY,
        'public.ecr.aws',
        label
      );
      assert.equal(job.permissions?.packages, undefined, label);
      for (const step of steps) {
        if (step.env?.SUPABASE_INTERNAL_IMAGE_REGISTRY)
          assert.equal(
            step.env.SUPABASE_INTERNAL_IMAGE_REGISTRY,
            'public.ecr.aws',
            label
          );
      }
    }
  }
  assert.equal(count, 20);
  assert.equal(
    existsSync(new URL('../../.github/actions/login-supabase-registry', base)),
    false
  );
});
