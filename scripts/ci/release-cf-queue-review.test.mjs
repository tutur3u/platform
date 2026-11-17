import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cfQueueJob,
  cfPhaseKey,
  RecipeFailure,
  runCfPhase,
  recipeDigest,
} from './release-cf-queue.mjs';
import {
  record,
  grant,
  input,
  authority,
  successful,
  job,
  run,
} from './release-cf-queue-test-helper.mjs';

test('terminal producer policy refusal preserves its cause and does not reconcile', async () => {
  const port = authority();
  const result = await run(port, async () => {
    throw new RecipeFailure('PRODUCTION_HELD', 'policy', 'policy');
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.guardCode, 'PRODUCTION_HELD');
  assert.equal(result.guardPhase, 'policy');
  assert.equal(result.failureClass, 'policy');
  assert.equal(result.cause.providerContacted, false);
});
for (const status of ['running', 'reconciling', 'failed', 'unknown'])
  test(`existing ${status} receipt remains untouched`, async () => {
    const port = authority();
    const payload = job();
    const receipt = { ...(await run(port)), status };
    port.state.receipts.set(cfPhaseKey(payload, 'publish'), receipt);
    let checkpoints = 0,
      effects = 0;
    port.checkpoint = async () => {
      checkpoints++;
    };
    const result = await run(
      port,
      async () => {
        effects++;
        return successful();
      },
      payload
    );
    assert.deepEqual(result, receipt);
    assert.equal(effects, 0);
    assert.equal(checkpoints, 0);
  });
test('stale epoch never checkpoints against rejected intent', async () => {
  const port = authority();
  let checkpoints = 0,
    effects = 0;
  port.beginPhase = async () => ({ grant: { ...grant, epoch: 2 } });
  port.checkpoint = async () => {
    checkpoints++;
  };
  const result = await run(port, async () => {
    effects++;
    return successful();
  });
  assert.equal(result.status, 'unknown');
  assert.equal(checkpoints, 0);
  assert.equal(effects, 0);
});
for (const [flag, code] of [
  ['approvalExpired', 'APPROVAL_EXPIRED'],
  ['lockOwnedByOther', 'TARGET_LOCK_CONFLICT'],
  ['workerSecretless', 'WORKER_INELIGIBLE'],
])
  test(`distinct authority refusal: ${code}`, async () => {
    const port = authority();
    port.state[flag] = true;
    const result = await run(port);
    assert.equal(result.status, 'failed');
    assert.equal(result.guardCode, code);
  });
for (const [label, change] of [
  [
    'string approvals',
    (x) => {
      x.authorizationRefs = 'approval';
    },
  ],
  [
    'nested credential',
    (x) => {
      x.authorizationRefs = [{ token: 'sk-live-example' }];
    },
  ],
  [
    'secret value',
    (x) => {
      x.provenance.actor = 'sk-live-example';
    },
  ],
  [
    'object artifact id',
    (x) => {
      x.artifact.id = { value: 'id' };
    },
  ],
  [
    'object actor',
    (x) => {
      x.provenance.actor = { password: 'hidden' };
    },
  ],
  [
    'object checkpoint',
    (x) => {
      x.checkpointRef = { id: 'id' };
    },
  ],
  [
    'unused rollback',
    (x) => {
      x.rollback = { apiToken: 'hidden' };
    },
  ],
  [
    'unbound recipe',
    (x) => {
      x.recipeSha256 = 'd'.repeat(64);
    },
  ],
  [
    'combined rollback',
    (x) => {
      x.requestedPhases = ['publish', 'rollback'];
      x.rollback = {
        deploymentId: 'good',
        authorizationRef: 'ref',
        scope: 'recorded-preimage',
      };
    },
  ],
  [
    'seal artifact',
    (x) => {
      x.requestedPhases = ['seal'];
      x.artifact = { token: 'hidden' };
    },
  ],
])
  test(`payload rejects ${label}`, () => {
    const values = input();
    change(values);
    assert.throws(() => cfQueueJob(structuredClone(record), values));
  });
test('hand-built invalid payload is refused before beginPhase', async () => {
  const payload = job();
  payload.rollback = { deploymentId: 'wrong' };
  let begun = 0;
  await assert.rejects(
    runCfPhase({
      authority: {
        beginPhase() {
          begun++;
        },
      },
      payload,
      grant,
      phase: 'publish',
      execute: successful,
    })
  );
  assert.equal(begun, 0);
});
test('account cannot be supplied and Calendar locks include shared hosts and retained Worker', async () => {
  const { profiles } = await import('./wave1-native-profile.mjs');
  const { payloadDigest } = await import('./release-cf-queue.mjs');
  const values = input();
  const calendar = profiles.apps.calendar.releaseRecipe;
  values.configSha256 = payloadDigest(calendar);
  const payload = cfQueueJob(calendar, values);
  assert.equal(payload.target.account, profiles.accountId);
  for (const alias of [
    'tuturuuu-calendar',
    'tuturuuu-calendar-path-candidate',
    'https://calendar.tuturuuu.com',
    'https://tuturuuu.com',
  ])
    assert.ok(payload.target.aliases.includes(alias));
  payload.target.account = '0'.repeat(32);
  await assert.rejects(
    runCfPhase({
      authority: authority(),
      payload,
      grant,
      phase: 'publish',
      execute: successful,
    })
  );
});
test('expired lease prevents effects and result checkpoints', async () => {
  const port = authority();
  let effects = 0,
    checkpoints = 0;
  port.checkpoint = async () => {
    checkpoints++;
  };
  const result = await run(
    port,
    async () => {
      effects++;
      return successful();
    },
    job(),
    { ...grant, leaseDeadline: new Date(0).toISOString() }
  );
  assert.equal(result.status, 'unknown');
  assert.equal(result.cause.guardCode, 'LEASE_EXPIRED');
  assert.equal(effects, 0);
  assert.equal(checkpoints, 0);
});
test('hung executor is aborted on deadline and requests durable stop', async () => {
  const port = authority();
  const payload = job();
  payload.requirements.maxDurationMs = 25;
  let signal;
  const result = await run(
    port,
    async (context) => {
      signal = context.signal;
      return new Promise(() => {});
    },
    payload
  );
  assert.equal(result.status, 'unknown');
  assert.equal(result.cause.guardCode, 'DEADLINE_EXCEEDED');
  assert.equal(signal.aborted, true);
  assert.equal(port.state.revision, 1);
});
test('executor can check a durable cancellation after each blocking step', async () => {
  const port = authority();
  let secondEffect = 0;
  const result = await run(port, async ({ checkFence, signal }) => {
    await port.requestStop(grant.jobId, 0);
    await assert.rejects(checkFence());
    assert.equal(signal.aborted, true);
    await checkFence();
    secondEffect++;
    return successful();
  });
  assert.equal(result.status, 'unknown');
  assert.equal(secondEffect, 0);
});
test('credential-shaped executor receipt is never persisted', async () => {
  const port = authority();
  const result = await run(port, async () => ({
    providerOperationId: 'sk-live-example',
    verificationRefs: ['readback'],
  }));
  assert.equal(result.status, 'unknown');
  assert.equal(JSON.stringify(result).includes('sk-live-example'), false);
});
test('computed recipe digest is stable and bound to queue inputs', () => {
  assert.match(recipeDigest(), /^[a-f0-9]{64}$/);
  assert.equal(job().recipeSha256, recipeDigest());
});

test('renewal rejection before provider contact never checkpoints the fresh intent', async () => {
  const port = authority();
  let checkpoints = 0,
    effects = 0;
  port.renew = async () => {
    throw new RecipeFailure('STALE_GRANT', 'publish', 'fence');
  };
  port.checkpoint = async () => {
    checkpoints++;
  };
  const result = await run(port, async () => {
    effects++;
    return successful();
  });
  assert.equal(result.status, 'unknown');
  assert.equal(effects, 0);
  assert.equal(checkpoints, 0);
});
test('structured producer refusal retains its code and class', async () => {
  const result = await run(authority(), async () => {
    throw {
      guardCode: 'POLICY_REFUSED',
      guardPhase: 'policy',
      class: 'policy',
      terminal: true,
      providerContacted: false,
    };
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.guardCode, 'POLICY_REFUSED');
  assert.equal(result.failureClass, 'policy');
});

test('malformed existing receipt cannot introduce credential values or checkpoint a replacement', async () => {
  const port = authority();
  const receipt = {
    ...(await run(port)),
    verificationRefs: [{ apiKey: 'hidden' }],
  };
  port.state.receipts.set(cfPhaseKey(job(), 'publish'), receipt);
  let checkpoints = 0,
    effects = 0;
  port.checkpoint = async () => {
    checkpoints++;
  };
  const result = await run(port, async () => {
    effects++;
    return successful();
  });
  assert.equal(result.status, 'unknown');
  assert.equal(checkpoints, 0);
  assert.equal(effects, 0);
  assert.equal(JSON.stringify(result).includes('hidden'), false);
});
test('checkpoint refusal after completed effect cannot downgrade uncertainty', async () => {
  const port = authority();
  port.checkpoint = async () => {
    throw new RecipeFailure('CHECKPOINT_REFUSED', 'checkpoint', 'authority');
  };
  const result = await run(port);
  assert.equal(result.status, 'unknown');
  assert.equal(result.cause.guardCode, 'CHECKPOINT_REFUSED');
});
