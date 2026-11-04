const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  evaluateExpression,
  truthy,
} = require('./github-expression-test-helper');
const {
  attacker,
  completion,
  dispatch,
  evaluateIf,
  headSha,
  repository,
  repositoryId,
  runGate,
  runningJobs,
  triggerStep,
  trustedProducers,
  workflowRunConsumers,
} = require('./workflow-run-trust-test-helper');

const consumers = workflowRunConsumers();
const consumerFiles = [...new Set(consumers.map(({ file }) => file))];
const workflowOf = (file) =>
  consumers.find((consumer) => consumer.file === file).workflow;
const producerNames = Object.fromEntries(
  require('./workflow-run-trust-test-helper')
    .loadWorkflows()
    .map(({ file, workflow }) => [file, workflow.name])
);

// A completion that every layer should accept for one TRUSTED_PRODUCERS line.
function trustedCompletion(producer, overrides = {}) {
  return completion(producerNames[producer.file], producer.branch, {
    conclusion:
      producer.conclusions[0] === 'any' ? 'failure' : producer.conclusions[0],
    event: producer.events[0],
    head_repository: { full_name: repository, id: repositoryId },
    path: `.github/workflows/${producer.file}`,
    workflow_id: producer.id,
    ...overrides,
  });
}

const reachable = { compareDefault: 'behind' };
const cases = consumerFiles.flatMap((file) =>
  trustedProducers(workflowOf(file)).map((producer) => ({
    file,
    producer,
    workflow: workflowOf(file),
  }))
);

test('expression helper models GitHub comparison semantics', () => {
  const evaluate = (source, github = {}) =>
    evaluateExpression(source, { github });
  assert.equal(evaluate("'Main' == 'main'"), true);
  assert.equal(evaluate("'PRODUCTION' != 'production'"), false);
  assert.equal(evaluate("null == ''"), true);
  assert.equal(evaluate('null == 0'), true);
  assert.equal(evaluate("'abc' == 0"), false);
  assert.equal(evaluate("'1' == 1"), true);
  assert.equal(evaluate('true == 1'), true);
  assert.equal(evaluate('github.missing.deep == null'), true);
  assert.equal(evaluate('!github.missing'), true);
  assert.equal(evaluate("github.a || 'fallback'", { a: '' }), 'fallback');
  assert.equal(evaluate("github.a && 'next'", { a: 'x' }), 'next');
  assert.equal(
    evaluate("github.event.head_repository.full_name == 'x'", {
      event: { head_repository: null },
    }),
    false
  );
  assert.equal(truthy(evaluate("format('{0}-{1}', 'a', 2)")), true);
  // A branch named Main passes an expression guard written for main.
  assert.equal(
    evaluateIf(
      "github.event.workflow_run.head_branch == 'main'",
      completion('x', 'Main')
    ),
    true
  );
});

test('every workflow_run consumer is gated by the canonical trust step', () => {
  assert.deepEqual(consumerFiles.sort(), [
    'discord-modal-deploy.yml',
    'production-package-resume.yaml',
    'release-please-transient-retry.yaml',
    'supabase-production.yaml',
  ]);
  const scripts = new Set();
  for (const file of consumerFiles) {
    const workflow = workflowOf(file);
    for (const [id, job] of Object.entries(workflow.jobs)) {
      const step = triggerStep(job);
      if (step) {
        // The proof runs first, before any checkout or secret.
        assert.equal(job.steps[0], step, `${file}:${id} trust step is first`);
        assert.equal(step.name, 'Verify trusted trigger');
        scripts.add(step.run);
        assert.doesNotMatch(step.run, /\$\{\{/u, `${file}: no interpolation`);
        assert.doesNotMatch(
          JSON.stringify(step.env),
          /github\.event|secrets\./u,
          `${file}: trust inputs come from the event file`
        );
        for (const later of job.steps.slice(1)) {
          const privileged =
            /secrets\.|workflow_run\.head_sha/u.test(JSON.stringify(later)) ||
            later.uses?.startsWith('actions/checkout@');
          if (!privileged) continue;
          assert.match(
            JSON.stringify(later),
            /steps\.(?:trigger|current|resolve_target)\.outputs\.(?:trusted|matches|head_sha|target_sha)/u,
            `${file}:${id}:${later.name} must depend on the trust step`
          );
          assert.doesNotMatch(
            JSON.stringify(later),
            /workflow_run\.head_sha/u,
            `${file}:${id}:${later.name} must use the verified SHA`
          );
        }
      } else {
        assert.match(
          String(job.if),
          /needs\.[\w-]+\.outputs\.(?:trusted|trusted_trigger) == 'true'/u,
          `${file}:${id} must be gated on a trust step output`
        );
      }
    }
    assert.ok(trustedProducers(workflow).length > 0, file);
  }
  assert.equal(scripts.size, 1, 'every consumer runs the same trust script');
});

test('trusted producers name every workflow_run upstream by path and ID', () => {
  for (const { file, upstreamName, workflow } of consumers) {
    const producers = trustedProducers(workflow);
    assert.ok(
      producers.some(({ file: p }) => producerNames[p] === upstreamName),
      `${file}: "${upstreamName}" has no trusted producer line`
    );
    for (const producer of producers) {
      assert.ok(Number.isSafeInteger(producer.id) && producer.id > 0);
      assert.ok(['main', 'production'].includes(producer.branch));
    }
  }
});

// The Discord deploy accepts only the live branch tip (REV-6459-5), or a head
// whose apps/discord tree is unchanged at the tip (REV-6459-8). Supabase
// Staging deliberately accepts any SHA reachable from main: production sync may
// promote a non-tip main SHA whose production migration needs its staging
// marker.
const tipRequired = new Set(['discord-modal-deploy.yml']);
const accepted = (file) =>
  tipRequired.has(file) ? ['identical'] : ['identical', 'behind'];

test('trusted completions pass both layers and bind the verified SHA', () => {
  for (const { file, producer, workflow } of cases) {
    for (const status of accepted(file)) {
      const github = trustedCompletion(producer);
      const running = runningJobs(workflow, github, {
        compareDefault: status,
        gate: 'run',
      });
      assert.ok(running.length > 0, `${file} rejects ${producer.file}`);
    }
    const job = Object.values(workflow.jobs).find((item) => triggerStep(item));
    const run = runGate(triggerStep(job), trustedCompletion(producer), {
      compare: {
        [`refs/heads/${producer.branch}...${headSha}`]: accepted(file).at(-1),
      },
    });
    assert.ok(run.ok, run.stdout + run.stderr);
    assert.deepEqual(run.outputs, {
      branch: producer.branch,
      head_sha: headSha,
      trusted: 'true',
    });
  }
});

function assertRejected(workflow, github, label, options = reachable) {
  assert.deepEqual(
    runningJobs(workflow, github, { ...options, gate: 'run' }),
    [],
    label
  );
}

test('case variants of protected branches pass expressions but not the gate', () => {
  for (const { file, producer, workflow } of cases) {
    const upper = producer.branch.toUpperCase();
    const title = producer.branch[0].toUpperCase() + producer.branch.slice(1);
    for (const branch of [upper, title]) {
      const github = trustedCompletion(producer, { head_branch: branch });
      // The expression layer alone would admit this completion.
      assert.ok(runningJobs(workflow, github).length > 0, `${file} ${branch}`);
      assertRejected(workflow, github, `${file}: ${branch}`);
    }
  }
  assert.ok(cases.some(({ producer }) => producer.branch === 'production'));
  assert.ok(cases.some(({ producer }) => producer.branch === 'main'));
});

test('tag sources and unreachable heads are rejected', () => {
  for (const { file, producer, workflow } of cases) {
    // A tag named like the branch reports head_branch "main"/"production",
    // but its commit is not reachable from the branch.
    for (const status of ['ahead', 'diverged']) {
      assertRejected(
        workflow,
        trustedCompletion(producer),
        `${file} ${status}`,
        {
          compareDefault: status,
        }
      );
    }
    for (const sha of ['', 'A'.repeat(40), 'a'.repeat(39), 'main']) {
      assertRejected(
        workflow,
        trustedCompletion(producer, { head_sha: sha }),
        `${file}: head sha ${sha}`
      );
    }
  }
  for (const file of consumerFiles) {
    const workflow = workflowOf(file);
    for (const job of Object.values(workflow.jobs)) {
      const step = triggerStep(job);
      if (!step) continue;
      const allowed = step.env.TRUSTED_DISPATCH_REF;
      const branch = allowed?.replace('refs/heads/', '') ?? 'main';
      const title = branch[0].toUpperCase() + branch.slice(1);
      for (const ref of [
        `refs/tags/${branch}`,
        `refs/heads/${title}`,
        `refs/heads/${branch.toUpperCase()}`,
        'refs/heads/feature/x',
      ]) {
        assert.equal(runGate(step, dispatch(ref), reachable).ok, false, ref);
      }
      assert.equal(
        runGate(step, dispatch(`refs/heads/${branch}`), {
          compareDefault: 'identical',
        }).ok,
        allowed !== undefined,
        `${file} manual dispatch`
      );
    }
  }
});

test('spoofed producer identity and head repository are rejected', () => {
  for (const { file, producer, workflow } of cases) {
    const spoofs = {
      'producer path': { path: '.github/workflows/spoofed-name.yml' },
      'producer path case': {
        path: `.github/workflows/${producer.file.toUpperCase()}`,
      },
      'producer ID': { workflow_id: producer.id + 1 },
      'missing producer ID': { workflow_id: null },
      'fork head repository': {
        head_repository: { full_name: attacker, id: repositoryId + 1 },
      },
      'head repository ID': {
        head_repository: { full_name: repository, id: repositoryId + 1 },
      },
      'head repository case': {
        head_repository: { full_name: 'Tutur3u/Platform', id: repositoryId },
      },
      'deleted head repository': { head_repository: null },
      'pull request event': { event: 'pull_request' },
      'event case': { event: producer.events[0].toUpperCase() },
    };
    if (!producer.conclusions.includes('any')) {
      spoofs.conclusion = { conclusion: 'cancelled' };
    }
    for (const [label, overrides] of Object.entries(spoofs)) {
      assertRejected(
        workflow,
        trustedCompletion(producer, overrides),
        `${file} ${producer.file}: ${label}`
      );
    }
  }
});

test('a gate rejection skips every dependent secret-bearing job', () => {
  const workflow = workflowOf('discord-modal-deploy.yml');
  const [producer] = trustedProducers(workflow);
  const github = trustedCompletion(producer, { head_branch: 'Main' });
  assert.deepEqual(runningJobs(workflow, github), ['trigger', 'deploy']);
  assert.deepEqual(
    runningJobs(workflow, github, { ...reachable, gate: 'run' }),
    []
  );
  const production = workflowOf('supabase-production.yaml');
  assert.match(
    production.jobs.deploy.if,
    /needs\.evaluate-prerequisites\.outputs\.trusted_trigger == 'true'/u
  );
});

test('reachability compares against refs/heads, never a same-named tag', () => {
  // REV-6459-4: for a tag push, head_branch is the tag name, and GitHub
  // resolves a bare compare base to refs/tags/<name> before refs/heads/<name>.
  for (const { file, producer, workflow } of cases) {
    const github = trustedCompletion(producer);
    const compare = {
      [`${producer.branch}...${headSha}`]: 'identical',
      [`refs/heads/${producer.branch}...${headSha}`]: 'diverged',
    };
    const job = Object.values(workflow.jobs).find((item) => triggerStep(item));
    const run = runGate(triggerStep(job), github, { compare });
    assert.equal(run.ok, false, `${file} accepted a tag-resolved compare`);
    assert.match(run.stdout + run.stderr, /Untrusted trigger/u);
    assertRejected(workflow, github, `${file} tag`, { compare });
  }
});

test('deploy consumers accept only the live branch tip', () => {
  // REV-6459-5: re-running an old completion must not redeploy an old commit.
  const flagged = consumerFiles.filter((file) =>
    Object.values(workflowOf(file).jobs).some(
      (job) => triggerStep(job)?.env?.REQUIRE_BRANCH_TIP === 'true'
    )
  );
  assert.deepEqual(flagged.sort(), [...tipRequired].sort());
  for (const { file, producer, workflow } of cases) {
    const github = trustedCompletion(producer);
    const behind = runningJobs(workflow, github, {
      compareDefault: 'behind',
      gate: 'run',
    });
    if (tipRequired.has(file)) {
      assert.deepEqual(behind, [], `${file} accepted a stale SHA`);
    } else {
      assert.ok(behind.length > 0, `${file} must accept a reachable SHA`);
    }
  }
  for (const file of tipRequired) {
    const step = Object.values(workflowOf(file).jobs)
      .map(triggerStep)
      .find(Boolean);
    assert.equal(
      runGate(step, dispatch('refs/heads/main'), { compareDefault: 'behind' })
        .ok,
      false,
      `${file} manual re-run of an old main commit`
    );
  }
});

test('Discord deploys a behind head only while apps/discord is unchanged at the tip', () => {
  // REV-6459-8: Discord CI runs only for apps/discord pushes, so unrelated
  // commits routinely land on main while it runs. A head behind the tip stays
  // deployable when the deployed tree is identical at the tip; an old re-run
  // whose Discord code has since changed is still rejected.
  const discord = cases.find(({ file }) => file === 'discord-modal-deploy.yml');
  const github = trustedCompletion(discord.producer);
  const tipSha = 'c'.repeat(40);
  const same = { [headSha]: 'd'.repeat(40), [tipSha]: 'd'.repeat(40) };
  const changed = { [headSha]: 'd'.repeat(40), [tipSha]: 'e'.repeat(40) };
  const jobs = (compareDefault, trees) =>
    runningJobs(discord.workflow, github, {
      compareDefault,
      gate: 'run',
      tipSha,
      trees,
    });
  assert.deepEqual(jobs('behind', same), ['trigger', 'deploy']);
  assert.deepEqual(jobs('behind', changed), []);
  assert.deepEqual(jobs('behind', {}), [], 'unreadable trees fail closed');
  assert.deepEqual(jobs('diverged', same), []);
  assert.deepEqual(jobs('ahead', same), []);
  assert.deepEqual(jobs('identical', {}), ['trigger', 'deploy']);

  // Only Discord opts into the tree rule. Staging accepts any head reachable
  // from refs/heads/main, whatever the trees, and still rejects the rest.
  const withTree = consumerFiles.filter((file) =>
    Object.values(workflowOf(file).jobs).some(
      (job) => triggerStep(job)?.env?.TIP_TREE_PATH
    )
  );
  assert.deepEqual(withTree, ['discord-modal-deploy.yml']);
  const staging = require('./workflow-yaml-test-helper').readWorkflow(
    'supabase-staging.yaml'
  );
  const stagingContext = {
    event_name: 'push',
    ref: 'refs/heads/main',
    ref_protected: true,
    repository,
    repository_id: String(repositoryId),
    sha: headSha,
    event: {
      ref: 'refs/heads/main',
      after: headSha,
      deleted: false,
      repository: { full_name: repository, id: repositoryId },
    },
  };
  const stagingJobs = (compareDefault) =>
    runningJobs(staging, stagingContext, {
      compareDefault,
      gate: 'run',
      tipSha,
      trees: changed,
    });
  assert.deepEqual(stagingJobs('behind'), ['migrate']);
  assert.deepEqual(stagingJobs('identical'), ['migrate']);
  for (const status of ['diverged', 'ahead']) {
    assert.deepEqual(stagingJobs(status), [], `staging ${status}`);
  }
});

test('tip-gated consumers re-check the tip in every job that checks out code', () => {
  // REV-6459-9: re-running only a failed deploy job reuses earlier needs
  // outputs, so the tip check must run in the same job as the checkout.
  for (const file of tipRequired) {
    const workflow = workflowOf(file);
    let checkouts = 0;
    for (const [id, job] of Object.entries(workflow.jobs)) {
      const steps = job.steps ?? [];
      const checkout = steps.findIndex((step) =>
        step.uses?.startsWith('actions/checkout@')
      );
      if (checkout < 0) continue;
      checkouts += 1;
      const gate = triggerStep(job);
      assert.ok(gate, `${file}:${id} checks out without its own trust step`);
      assert.equal(steps.indexOf(gate), 0, `${file}:${id} gate runs first`);
      assert.equal(gate.env.REQUIRE_BRANCH_TIP, 'true', `${file}:${id}`);
      assert.match(
        String(steps[checkout].with.ref),
        /^\$\{\{ steps\.trigger\.outputs\.head_sha \}\}$/u,
        `${file}:${id} checks out the SHA verified in this job`
      );
    }
    assert.ok(checkouts > 0, file);
  }
});
