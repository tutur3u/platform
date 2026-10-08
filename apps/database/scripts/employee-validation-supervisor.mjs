import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  closedTap,
  expectedTapCounts,
  packets,
  verifyPacketCounts,
  verifyStaged,
  verifyAdmission,
} from './employee-validation-core.mjs';
import {
  requireCommand,
  safeFailure,
  commandFailure,
  validateSupervisedCommand,
} from './employee-validation-command.mjs';
import { daemonArguments } from './employee-validation-host.mjs';
const recoveryByError = new WeakMap();
export const getAttemptRecovery = (error) => recoveryByError.get(error) ?? null;
const secondaryFailure = (error, phase) => ({
  phase,
  reason:
    error?.code === 'ERR_ASSERTION' ? 'assertion-failed' : 'validation-failed',
  code: 1,
  clientClosed: null,
  sqlstates: [],
  compilerCodes: [],
});
export const dedicatedPolicy = 'dedicated-employee-validation-v1';
const digest = (value) => createHash('sha256').update(value).digest('hex');
const hash = (value) => assert.match(value, /^[a-f0-9]{64}$/u);
const keys = (value, names) => {
  assert(value && Object.getPrototypeOf(value) === Object.prototype);
  assert.deepEqual(Object.keys(value).sort(), names.split(' ').sort());
};
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, canonical(value[k])])
        )
      : value;
export const canonicalJson = (value) => `${JSON.stringify(canonical(value))}\n`;
const freeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
export function parseReviewedAdmission(bytes) {
  const value = JSON.parse(bytes.toString());
  if (
    value.version !== 1 ||
    value.host?.policy === dedicatedPolicy ||
    value.supervisor
  )
    assert.equal(
      bytes.toString(),
      canonicalJson(value),
      'Canonical admission bytes required'
    );
  return value;
}
export function admissionProfile(admission) {
  if (
    admission.version === 1 &&
    admission.host?.policy === 'authorized-shared32-protected16'
  ) {
    assert(!Object.hasOwn(admission, 'supervisor'), 'Mixed shared admission');
    keys(
      admission.host,
      'policy machineId dockerSocket minAvailableBytes protectedBaseline'
    );
    return 'shared';
  }
  assert.equal(admission.version, 2);
  assert.equal(admission.host?.policy, dedicatedPolicy);
  return 'dedicated';
}
export function verifyDedicatedAdmission(a) {
  keys(
    a,
    'version phase sourceManifestSha256 rootReviewedDriver rootReviewedCleanup rootApprovedStartup rootReviewedImageSelection reviewReceiptSha256 expiresAt host cliSourceCommit images dependencyIdentitySha256 dependencyIdentity cliBinarySha256 tapCounts supervisor'
  );
  keys(
    a.host,
    'policy machineId bootId executionRoot daemonIdentity daemonEndpoint daemonDataRoot'
  );
  keys(
    a.supervisor,
    'invocationId externalAuthorizationSha256 targetMappingSha256 policySha256 binarySha256 dockerBinarySha256 nodeBinarySha256 configSha256 effectiveConfigSha256 imageClosureSha256 networkSha256 quotaId temporaryRoot controlRoot logRoot brokerFence clockOrigin issuedMonotonicMs hardDeadlineMs closureReserveMs basePort configBytes'
  );
  assert.match(
    a.supervisor.invocationId,
    /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u
  );
  for (const [k, v] of Object.entries(a.supervisor))
    if (k.endsWith('Sha256')) hash(v);
  for (const k of ['machineId', 'bootId', 'daemonIdentity'])
    assert.match(a.host[k], /^[a-zA-Z0-9-]{8,128}$/u);
  for (const k of ['quotaId', 'brokerFence', 'clockOrigin'])
    assert.match(a.supervisor[k], /^[a-zA-Z0-9-]{8,128}$/u);
  const roots = [
    a.host.executionRoot,
    a.host.daemonDataRoot,
    a.supervisor.temporaryRoot,
    a.supervisor.controlRoot,
    a.supervisor.logRoot,
  ];
  for (const root of roots)
    assert(
      path.isAbsolute(root) && path.resolve(root) === root && root !== '/'
    );
  for (let i = 0; i < roots.length; i++)
    for (let j = i + 1; j < roots.length; j++)
      assert(
        !roots[i].startsWith(`${roots[j]}/`) &&
          !roots[j].startsWith(`${roots[i]}/`) &&
          roots[i] !== roots[j],
        'Aliased quota roots'
      );
  assert.match(a.host.daemonEndpoint, /^unix:\/\/\/[a-zA-Z0-9/_-]+\.sock$/u);
  assert.notEqual(a.host.daemonEndpoint, 'unix:///var/run/docker.sock');
  assert.equal(
    path.resolve(a.host.daemonEndpoint.slice(7)),
    a.host.daemonEndpoint.slice(7)
  );
  assert.equal(typeof a.supervisor.configBytes, 'string');
  assert.equal(
    digest(a.supervisor.configBytes),
    a.supervisor.effectiveConfigSha256
  );
  for (const k of ['issuedMonotonicMs', 'hardDeadlineMs', 'closureReserveMs'])
    assert(Number.isFinite(a.supervisor[k]));
  const s = a.supervisor;
  assert(s.issuedMonotonicMs >= 0 && s.closureReserveMs >= 60000);
  assert(s.hardDeadlineMs > s.issuedMonotonicMs + s.closureReserveMs);
  assert(s.hardDeadlineMs - s.issuedMonotonicMs <= 900000);
  assert(
    Number.isInteger(s.basePort) && s.basePort >= 1024 && s.basePort <= 65000
  );
  for (const image of a.images)
    keys(image, 'role reference id digest cliSelectionSource');
}
export function remainingBudget(lease, clock, phase = 'body') {
  const t = clock();
  assert(
    t && Number.isFinite(t.monotonicMs) && Number.isFinite(t.civilMs),
    'Clock fault'
  );
  assert.equal(t.machineId, lease.binding.host.machineId);
  assert.equal(t.bootId, lease.binding.host.bootId);
  assert.equal(t.origin, lease.binding.supervisor.clockOrigin);
  assert(t.monotonicMs >= lease.issuedMonotonicMs, 'Clock reset');
  const deadline =
    phase === 'close' ? lease.hardDeadlineMs : lease.bodyDeadlineMs;
  const civil =
    phase === 'close'
      ? Infinity
      : Date.parse(lease.binding.expiresAt) - t.civilMs;
  const remaining = Math.min(deadline - t.monotonicMs, civil);
  assert(remaining > 0, 'Absolute attempt deadline');
  return { remaining, time: t.monotonicMs };
}
const closureFields =
  'producers pg http descendants containers networks volumes daemon ledger'.split(
    ' '
  );
const evidenceKeys =
  'aggregate firstCreate roles quota config images egress providers hooks mail mounts ports rawSocket mutableInputs pulls protectedExcluded bootstrapPolicy controllerEnclosed recoveryReserved';
export function verifyDedicatedReceipt(admission, lease, receipt) {
  keys(
    receipt,
    'binding leaseId generation recoveryId state issuedMonotonicMs bodyDeadlineMs hardDeadlineMs closureReserveMs effectiveReceiptSha256 evidence'
  );
  const { evidence, ...identity } = receipt;
  assert.deepEqual(identity, lease);
  assert.equal(receipt.state, 'OPEN');
  keys(evidence, evidenceKeys);
  assert.deepEqual(evidence.aggregate, {
    cpus: 4,
    memoryBytes: 8 * 1024 ** 3,
    extraSwapBytes: 0,
    pids: 1024,
    diskBytes: 16 * 1024 ** 3,
    logBytes: 256 * 1024 ** 2,
  });
  for (const k of evidenceKeys.split(' ').slice(1))
    assert.equal(evidence[k], true, `Missing supervisor policy: ${k}`);
  assert.equal(digest(canonicalJson(evidence)), lease.effectiveReceiptSha256);
  verifyDedicatedAdmission(admission);
}
export function assertAttemptOpen(context, phase = 'body') {
  return context.budget(phase);
}
// This is a client contract. No native trusted transport or physical enforcement exists here.
export async function createAttemptContext({
  admission,
  admissionSha256,
  supervisor,
  clock,
}) {
  assert.equal(admissionProfile(admission), 'dedicated');
  verifyDedicatedAdmission(admission);
  hash(admissionSha256);
  assert.equal(digest(canonicalJson(admission)), admissionSha256);
  assert(supervisor && clock, 'Native supervisor backend unavailable; DENIED');
  verifyAdmission(admission, admission.sourceManifestSha256, clock().civilMs);
  for (const method of ['acquire', 'attest', 'persist', 'command', 'close'])
    assert.equal(typeof supervisor[method], 'function');
  const binding = freeze(
    JSON.parse(
      JSON.stringify({
        admissionSha256,
        sourceManifestSha256: admission.sourceManifestSha256,
        expiresAt: admission.expiresAt,
        host: admission.host,
        supervisor: admission.supervisor,
        cliBinarySha256: admission.cliBinarySha256,
        dependencyIdentitySha256: admission.dependencyIdentitySha256,
        images: admission.images,
      })
    )
  );
  const s = binding.supervisor;
  const provisional = {
    binding,
    issuedMonotonicMs: s.issuedMonotonicMs,
    hardDeadlineMs: s.hardDeadlineMs,
    bodyDeadlineMs: s.hardDeadlineMs - s.closureReserveMs,
  };
  let last = remainingBudget(provisional, clock).time;
  let state = 'OPEN',
    sequence = 0,
    closePromise,
    failurePromise,
    failed = false;
  const closureAccess = Symbol('exact-closure');
  const sealFailure = () => {
    if (state === 'CLOSED') return;
    failed = true;
    if (state === 'OPEN') state = 'CLOSING';
  };
  const terminalFailure = () => {
    sealFailure();
    if (state !== 'CLOSED') state = 'FAILED';
  };
  const budget = (phase = 'body', access = null) => {
    const exactClosure = phase === 'close' && access === closureAccess;
    assert(
      state === 'OPEN' || (exactClosure && state === 'CLOSING' && closePromise),
      'Attempt sealed'
    );
    try {
      const b = remainingBudget(
        provisional,
        clock,
        exactClosure ? 'close' : 'body'
      );
      assert(b.time >= last, 'Backwards attempt clock');
      last = b.time;
      return b.remaining;
    } catch (error) {
      sealFailure();
      throw error;
    }
  };
  let lease,
    ownedLease = false;
  const ack = (value, record) => {
    keys(value, 'leaseId generation recoveryId sequence recordSha256 durable');
    assert.deepEqual(value, {
      leaseId: lease.leaseId,
      generation: lease.generation,
      recoveryId: lease.recoveryId,
      sequence: record.sequence,
      recordSha256: digest(canonicalJson(record)),
      durable: true,
    });
  };
  const persist = async (kind, payload, phase = 'body', access = null) => {
    budget(phase, access);
    const record = freeze({
      kind,
      payload,
      sequence: ++sequence,
      binding,
      hardDeadlineMs: lease.hardDeadlineMs,
    });
    budget(phase, access);
    try {
      ack(await supervisor.persist(lease, record), record);
      budget(phase, access);
    } catch (error) {
      sealFailure();
      throw error;
    }
  };
  const attest = async () => {
    try {
      budget();
      const receipt = await supervisor.attest(lease);
      budget(); // Post-await expiry must fence every following effect.
      verifyDedicatedReceipt(admission, lease, receipt);
      return receipt;
    } catch (error) {
      sealFailure();
      throw error;
    }
  };
  const dockerArgs = Object.freeze(['--host', binding.host.daemonEndpoint]);
  const run = async (command, args, cwd, options = {}) => {
    const phase = options.phase ?? 'command';
    try {
      assert(
        phase !== 'stop',
        'Dedicated stop belongs to exact supervisor close'
      );
      budget();
      assert(
        path.isAbsolute(cwd) &&
          (cwd === binding.host.executionRoot ||
            cwd.startsWith(`${s.temporaryRoot}/tuturuuu-supabase-`)),
        'Command cwd escape'
      );
      if (command === 'docker')
        assert.deepEqual(
          args.slice(0, 2),
          dockerArgs,
          'Daemon endpoint escape'
        );
      else
        assert(
          command === 'reviewed-cli' || command === 'reviewed-node',
          'Unreviewed executable'
        );
      assert(!args.includes('update'), 'Poststart caps forbidden');
      validateSupervisedCommand(command, args, cwd, phase, binding);
      const phaseCap = ['start', 'reset'].includes(phase)
        ? 300000
        : phase === 'typegen-execute' ||
            phase === 'typegen-compiler' ||
            phase.startsWith('sql-packet-')
          ? 60000
          : 10000;
      assert(
        Number.isFinite(options.timeoutMs ?? phaseCap) &&
          (options.timeoutMs ?? phaseCap) > 0
      );
      assert(
        Number.isInteger(options.maxBytes ?? 16 * 1024 ** 2) &&
          (options.maxBytes ?? 16 * 1024 ** 2) > 0 &&
          (options.maxBytes ?? 16 * 1024 ** 2) <= 64 * 1024 ** 2
      );
      await attest();
      const request = freeze({
        command,
        args: [...args],
        cwd,
        phase,
        timeoutMs: Math.min(options.timeoutMs ?? phaseCap, phaseCap, budget()),
        maxBytes: options.maxBytes ?? 16 * 1024 ** 2,
        executableSha256:
          command === 'reviewed-cli'
            ? binding.cliBinarySha256
            : command === 'docker'
              ? s.dockerBinarySha256
              : s.nodeBinarySha256,
        env: {
          PATH: '/usr/local/bin:/usr/bin:/bin',
          LANG: 'C.UTF-8',
          DOCKER_HOST: binding.host.daemonEndpoint,
        },
        binding,
      });
      await persist('command-intent', request);
      budget();
      let result;
      result = await supervisor.command(lease, request);
      keys(
        result,
        'code stdout clientClosed phase reason sqlstates compilerCodes'
      );
      assert(
        Number.isInteger(result.code) &&
          typeof result.stdout === 'string' &&
          Buffer.byteLength(result.stdout) <= request.maxBytes
      );
      assert.equal(result.phase, phase);
      assert(
        [
          'success',
          'nonzero-exit',
          'timeout',
          'output-overflow',
          'spawn-error',
          'input-error',
          'supervisor-denied',
        ].includes(result.reason)
      );
      assert.equal(typeof result.clientClosed, 'boolean');
      assert(
        Array.isArray(result.sqlstates) &&
          result.sqlstates.every(
            (v) => typeof v === 'string' && /^[0-9A-Z]{5}$/u.test(v)
          )
      );
      assert(
        Array.isArray(result.compilerCodes) &&
          result.compilerCodes.every(
            (v) => typeof v === 'string' && /^TS[0-9]{4,5}$/u.test(v)
          )
      );
      const primary =
        result.code !== 0 || !result.clientClosed
          ? commandFailure(result)
          : null;
      let secondaryPhase = 'command-result-deadline';
      try {
        budget();
        secondaryPhase = 'command-result-ledger';
        await persist('command-result', {
          phase,
          code: result.code,
          clientClosed: result.clientClosed,
        });
      } catch (secondary) {
        if (primary) {
          primary.secondary = secondaryFailure(secondary, secondaryPhase);
          throw primary;
        }
        throw secondary;
      }
      if (primary) throw primary;
      return result;
    } catch (error) {
      sealFailure();
      throw error;
    }
  };
  const close = (payload) => {
    if (closePromise) return closePromise;
    if (state === 'FAILED' || state === 'CLOSED')
      return Promise.reject(new Error('Attempt sealed'));
    state = 'CLOSING';
    // Publish before callbacks. Adapters may reenter, but cannot await their own finalizer.
    closePromise = Promise.resolve()
      .then(async () => {
        budget('close', closureAccess);
        const proof = await supervisor.close(lease, payload);
        budget('close', closureAccess);
        keys(
          proof,
          'leaseId generation recoveryId binding producers pg http descendants containers networks volumes daemon ledger'
        );
        assert.equal(proof.leaseId, lease.leaseId);
        assert.equal(proof.generation, lease.generation);
        assert.equal(proof.recoveryId, lease.recoveryId);
        assert.deepEqual(proof.binding, binding);
        for (const k of closureFields)
          assert.equal(proof[k], true, `Incomplete closure: ${k}`);
        await persist('closure-proof', proof, 'close', closureAccess);
        return freeze(proof);
      })
      .catch((error) => {
        terminalFailure();
        throw error;
      });
    return closePromise;
  };
  const recoveryIdentity = () =>
    freeze({
      invocationId: s.invocationId,
      admissionSha256,
      hardDeadlineMs: s.hardDeadlineMs,
      ownership: ownedLease ? 'validated' : 'ambiguous',
      ...(ownedLease
        ? {
            leaseId: lease.leaseId,
            generation: lease.generation,
            recoveryId: lease.recoveryId,
          }
        : {}),
    });
  const fail = async (primary, reason = 'initialization-failed-retain') => {
    if (!failurePromise) {
      sealFailure();
      failurePromise = Promise.resolve().then(async () => {
        let proof = null,
          secondary = null;
        try {
          if (ownedLease) proof = await close({ reason });
        } catch (error) {
          secondary = secondaryFailure(error, 'owned-failure-close');
        } finally {
          terminalFailure();
        }
        const closureProof = proof
          ? {
              leaseId: proof.leaseId,
              generation: proof.generation,
              recoveryId: proof.recoveryId,
              ...Object.fromEntries(closureFields.map((k) => [k, proof[k]])),
            }
          : null;
        return freeze({
          ...recoveryIdentity(),
          failed: true,
          retainRecovery: true,
          closureProof,
          secondary,
        });
      });
    }
    const recovery = await failurePromise;
    if (
      primary &&
      (typeof primary === 'object' || typeof primary === 'function')
    ) {
      recoveryByError.set(primary, recovery);
    }
    return recovery;
  };
  try {
    lease = freeze(await supervisor.acquire(binding));
    keys(
      lease,
      'binding leaseId generation recoveryId state issuedMonotonicMs bodyDeadlineMs hardDeadlineMs closureReserveMs effectiveReceiptSha256'
    );
    assert.deepEqual(lease.binding, binding);
    assert.equal(lease.state, 'OPEN');
    for (const k of ['leaseId', 'recoveryId'])
      assert.match(lease[k], /^[a-zA-Z0-9-]{8,128}$/u);
    assert(Number.isInteger(lease.generation) && lease.generation > 0);
    for (const k of ['issuedMonotonicMs', 'hardDeadlineMs', 'bodyDeadlineMs'])
      assert.equal(lease[k], provisional[k]);
    assert.equal(lease.closureReserveMs, s.closureReserveMs);
    hash(lease.effectiveReceiptSha256);
    ownedLease = true;
    budget();
    await attest();
  } catch (primary) {
    await fail(primary);
    throw primary;
  }
  return {
    lease,
    dockerArgs,
    budget,
    persist,
    run,
    attest,
    close,
    fail,
    state: () => state,
    failed: () => failed,
    async step(kind, operation) {
      try {
        budget();
        await persist(`${kind}-intent`, {
          kind,
          temporaryRoot: s.temporaryRoot,
        });
        budget();
        const result = await operation();
        budget();
        return result;
      } catch (error) {
        sealFailure();
        throw error;
      }
    },
    async removeRoot(root, remove) {
      try {
        assert(closePromise, 'Closure required before root removal');
        await closePromise;
        assert(!failed, 'Failed invocation retains root');
        budget('close', closureAccess);
        assert(
          path.dirname(root) === s.temporaryRoot &&
            path.basename(root).startsWith('tuturuuu-supabase-'),
          'Foreign root'
        );
        await persist('root-removal-intent', { root }, 'close', closureAccess);
        assert(!failed, 'Failed invocation retains root');
        budget('close', closureAccess);
        await remove(root, { temporaryRoot: s.temporaryRoot });
        budget('close', closureAccess);
        await persist(
          'final-ack',
          { rootRemoved: true },
          'close',
          closureAccess
        );
        assert(!failed, 'Failed invocation retains recovery');
        state = 'CLOSED';
      } catch (error) {
        terminalFailure();
        throw error;
      }
    },
  };
}
export async function executePackets({
  root,
  metadata,
  admission,
  run = requireCommand,
  checkSources,
  context = null,
  checkStaged = verifyStaged,
  tracker = null,
}) {
  assert(admission.version !== 2 || context, 'Dedicated context required');
  const dockerPrefix = daemonArguments(context);
  if (context)
    run = tracker
      ? (cmd, args, cwd, settings) =>
          tracker.attempt(settings.phase, () =>
            context.run(cmd, args, cwd, settings)
          )
      : context.run;
  verifyPacketCounts(admission.tapCounts);
  const container = `supabase_db_${metadata.projectId}`;
  for (const file of packets) {
    try {
      context?.budget();
      checkSources();
      checkStaged(root, metadata, [file], context);
      context?.budget();
      const target = `/tmp/${path.basename(file)}`;
      await run(
        'docker',
        [
          ...dockerPrefix,
          'cp',
          path.join(
            metadata.disposableRoot,
            file.slice('apps/database/'.length)
          ),
          `${container}:${target}`,
        ],
        root,
        {
          timeoutMs: 10000,
          phase: `sql-copy-${path.basename(file)}`,
        }
      );
      const result = await run(
        'docker',
        [
          ...dockerPrefix,
          'exec',
          '--env',
          'PGOPTIONS=-c statement_timeout=45000 -c lock_timeout=3000',
          container,
          'psql',
          '-X',
          '-A',
          '-t',
          '-v',
          'VERBOSITY=verbose',
          '-v',
          'ON_ERROR_STOP=1',
          '-U',
          'supabase_admin',
          '--dbname',
          'postgres',
          '-f',
          target,
        ],
        root,
        { timeoutMs: 60000, phase: `sql-packet-${path.basename(file)}` }
      );
      const count = closedTap(
        result.stdout,
        expectedTapCounts[path.basename(file)]
      );
      console.log(
        `SQL packet ${path.basename(file)}: ${count} assertions; BEGIN/ROLLBACK; no skips`
      );
    } catch (error) {
      error.receipt ??= safeFailure(error, `sql-packet-${path.basename(file)}`);
      throw error;
    }
  }
}
