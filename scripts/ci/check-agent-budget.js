#!/usr/bin/env node

// Finite structural check for the agent operating model. The T3 runtime does
// not enforce the ten-agent ceiling, and no live session is claimed to support
// ten; the budget is a repository contract that this checker verifies against
// declared allocation files. It never contacts T3, GitHub or a model provider,
// and a passing result is not proof that a live thread tree stayed in budget.

const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const MARKER_RE = /`agent-allocation:\s*(\d+)`/gu;
const ROLES = new Set(['lead', 'worker', 'reviewer']);
// Queued, executing, waiting-for-children, blocked and reserved agents all hold
// a slot; only drained (done/retired) agents release it.
const LIVE_STATES = new Set([
  'reserved',
  'queued',
  'active',
  'waiting',
  'blocked',
]);
const STATES = new Set([...LIVE_STATES, 'done', 'retired']);
const MAX_DEPTH = 3;
const RUNTIME_UNITS = new Set(['per-thread-tree', 'per-parent']);

// Every governance surface must declare the same project allocation.
const MARKER_FILES = [
  'AGENTS.md',
  'plugins/tuturuuu/skills/tuturuuu-agent-coordination/references/program-orchestration.md',
  'apps/docs/build/development-tools/agent-operating-model.mdx',
];
const EXAMPLE_FILES = [
  'plugins/tuturuuu/skills/tuturuuu-agent-coordination/references/agent-allocation.example.json',
];

function readMarkers(text) {
  return [...text.matchAll(MARKER_RE)].map((match) => Number(match[1]));
}

/** Reads the canonical project allocation from AGENTS.md text. */
function parseProjectCap(agentsText) {
  const values = readMarkers(agentsText);
  if (values.length !== 1) {
    throw new Error(
      `AGENTS.md must declare exactly one \`agent-allocation: <n>\` marker (found ${values.length}).`
    );
  }
  return values[0];
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function reservation(agent) {
  return 1 + (agent.role === 'lead' ? (agent.budget ?? 0) : 0);
}

/**
 * Validates one declared allocation. `cap` is the project allocation from
 * AGENTS.md; the file may declare a smaller allocation but never a larger one.
 */
function validateAllocation(allocation, { cap }) {
  const errors = [];
  const fail = (message) => errors.push(message);

  if (!allocation || typeof allocation !== 'object') {
    return { errors: ['Allocation must be a JSON object.'], live: 0 };
  }
  if (allocation.version !== 1) fail('version must be 1.');
  const owner = allocation.owner;
  if (typeof owner !== 'string' || owner.trim() === '') {
    fail('owner must name the project integration owner.');
  }
  if (!isPositiveInteger(allocation.allocation)) {
    fail('allocation must be a positive integer.');
  } else if (allocation.allocation > cap) {
    fail(
      `allocation ${allocation.allocation} exceeds the project allocation ${cap} declared in AGENTS.md.`
    );
  }
  // The allocation is the lowest of the ceiling, the runtime limit observed for
  // the launching session (with its unit), resource admission and any explicit
  // lower allocation, so the observed limit must be recorded.
  const observed = allocation.observedRuntimeLimit;
  if (
    !observed ||
    !isPositiveInteger(observed.limit) ||
    !RUNTIME_UNITS.has(observed.unit)
  ) {
    fail(
      'observedRuntimeLimit must record a positive limit and unit per-thread-tree or per-parent.'
    );
  } else if (
    observed.unit === 'per-thread-tree' &&
    isPositiveInteger(allocation.allocation) &&
    allocation.allocation > observed.limit
  ) {
    fail(
      `allocation ${allocation.allocation} exceeds the observed runtime limit ${observed.limit} (${observed.unit}).`
    );
  }
  if (
    allocation.validationLanes !== undefined &&
    !isPositiveInteger(allocation.validationLanes)
  ) {
    fail('validationLanes must be a positive integer when declared.');
  }
  if (!Array.isArray(allocation.agents)) {
    fail('agents must be an array.');
    return { errors, live: 0 };
  }

  const byId = new Map();
  for (const agent of allocation.agents) {
    const id = agent?.id;
    if (typeof id !== 'string' || id.trim() === '') {
      fail('Every agent needs a nonempty id.');
      continue;
    }
    if (id === owner) fail(`${id}: the owner is not a subagent entry.`);
    if (byId.has(id)) fail(`${id}: duplicate agent id.`);
    byId.set(id, agent);
  }

  const parentOf = (agent) =>
    agent.parent === owner ? null : byId.get(agent.parent);
  const depthOf = (agent) => {
    let depth = 1;
    const seen = new Set([agent.id]);
    for (let parent = parentOf(agent); parent; parent = parentOf(parent)) {
      if (seen.has(parent.id)) return Number.POSITIVE_INFINITY;
      seen.add(parent.id);
      depth += 1;
    }
    return depth;
  };
  const isLive = (agent) => LIVE_STATES.has(agent.state);

  for (const agent of byId.values()) {
    const { id } = agent;
    if (!ROLES.has(agent.role))
      fail(`${id}: role must be lead, worker or reviewer.`);
    if (!STATES.has(agent.state)) {
      fail(`${id}: state must be one of ${[...STATES].join(', ')}.`);
    }
    if (agent.parent !== owner && !byId.has(agent.parent)) {
      fail(
        `${id}: parent ${agent.parent} is neither the owner nor a declared agent.`
      );
      continue;
    }
    const parent = parentOf(agent);
    if (parent && parent.role !== 'lead') {
      fail(
        `${id}: only leads may have children (parent ${parent.id} is a ${parent.role}).`
      );
    }
    const depth = depthOf(agent);
    if (!Number.isFinite(depth)) fail(`${id}: parent chain contains a cycle.`);
    else if (depth > MAX_DEPTH) {
      fail(
        `${id}: nesting depth ${depth} exceeds the bounded hierarchy (${MAX_DEPTH}).`
      );
    }
    if (agent.role === 'lead') {
      if (!Number.isInteger(agent.budget) || agent.budget < 0) {
        fail(`${id}: a lead needs an explicit non-negative remaining budget.`);
      }
    } else if (agent.budget !== undefined) {
      fail(`${id}: only leads carry a delegated budget.`);
    }
    if (agent.writesIntegration === true) {
      fail(`${id}: only the project owner writes main/integration.`);
    }
    if (parent && isLive(agent) && !isLive(parent)) {
      fail(
        `${id}: live agent under a ${parent.state} parent ${parent.id}; retire or re-parent it.`
      );
    }
    if (agent.role === 'reviewer') {
      const reviewed = byId.get(agent.reviews);
      if (!reviewed)
        fail(`${id}: reviewer must name a declared agent in reviews.`);
      else if (reviewed.id === id)
        fail(`${id}: a reviewer cannot review itself.`);
      else {
        for (
          let parentNode = parentOf(agent);
          parentNode;
          parentNode = parentOf(parentNode)
        ) {
          if (parentNode.id === reviewed.id) {
            fail(
              `${id}: reviewer is a descendant of the author ${reviewed.id}; use an independent reviewer.`
            );
            break;
          }
        }
      }
    }
  }

  const live = [...byId.values()].filter(isLive);
  if (
    isPositiveInteger(allocation.allocation) &&
    live.length > allocation.allocation
  ) {
    fail(
      `${live.length} live agents exceed the allocation of ${allocation.allocation} (descendants count).`
    );
  }

  // Each parent's live children must fit inside the budget it holds: the owner
  // holds the allocation, a lead holds its explicit remaining budget.
  const childrenOf = new Map();
  for (const agent of live) {
    const key = agent.parent;
    childrenOf.set(key, [...(childrenOf.get(key) ?? []), agent]);
  }
  for (const [parentId, children] of childrenOf) {
    if (
      observed?.unit === 'per-parent' &&
      isPositiveInteger(observed.limit) &&
      children.length > observed.limit
    ) {
      fail(
        `${parentId}: ${children.length} live direct children exceed the observed runtime limit ${observed.limit} (per-parent).`
      );
    }
    const reserved = children.reduce(
      (sum, child) => sum + reservation(child),
      0
    );
    if (parentId === owner) {
      if (
        isPositiveInteger(allocation.allocation) &&
        reserved > allocation.allocation
      ) {
        fail(
          `owner reservations ${reserved} oversubscribe the allocation ${allocation.allocation}.`
        );
      }
      continue;
    }
    const parent = byId.get(parentId);
    if (
      parent?.role === 'lead' &&
      Number.isInteger(parent.budget) &&
      reserved > parent.budget
    ) {
      fail(
        `${parentId}: children reserve ${reserved}, exceeding its remaining budget ${parent.budget}.`
      );
    }
  }

  const heavy = live.filter((agent) => agent.heavyValidation === true).length;
  if (
    isPositiveInteger(allocation.validationLanes) &&
    heavy > allocation.validationLanes
  ) {
    fail(
      `${heavy} live heavy validations exceed ${allocation.validationLanes} validation lanes; agent budget is not resource admission.`
    );
  }

  return { errors, live: live.length };
}

/** Checks marker consistency across governance files and the shipped examples. */
function checkRepository(root = ROOT_DIR) {
  const errors = [];
  let cap = null;
  try {
    cap = parseProjectCap(
      fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')
    );
  } catch (error) {
    errors.push(error.message);
  }
  for (const file of MARKER_FILES.slice(1)) {
    let values = [];
    try {
      values = readMarkers(fs.readFileSync(path.join(root, file), 'utf8'));
    } catch {
      errors.push(`${file}: missing governance file.`);
      continue;
    }
    if (values.length === 0)
      errors.push(`${file}: missing \`agent-allocation: <n>\` marker.`);
    for (const value of values) {
      if (cap !== null && value !== cap) {
        errors.push(
          `${file}: agent-allocation ${value} disagrees with AGENTS.md (${cap}).`
        );
      }
    }
  }
  if (cap !== null) {
    for (const file of EXAMPLE_FILES) {
      const result = validateFile(path.join(root, file), { cap });
      errors.push(...result.errors.map((error) => `${file}: ${error}`));
    }
  }
  return { cap, errors };
}

function validateFile(filePath, { cap }) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return { errors: [`cannot read allocation: ${error.message}`], live: 0 };
  }
  return validateAllocation(parsed, { cap });
}

function main(argv = process.argv.slice(2), root = ROOT_DIR) {
  const repository = checkRepository(root);
  const errors = [...repository.errors];
  for (const file of argv) {
    const result = validateFile(path.resolve(file), {
      cap: repository.cap ?? 0,
    });
    errors.push(...result.errors.map((error) => `${file}: ${error}`));
    if (result.errors.length === 0) {
      console.log(`${file}: ${result.live} live agents within budget.`);
    }
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(error);
    return 1;
  }
  console.log(
    `Agent budget contract: allocation ${repository.cap}, governance files agree.`
  );
  return 0;
}

if (require.main === module) process.exitCode = main();

module.exports = {
  EXAMPLE_FILES,
  MARKER_FILES,
  checkRepository,
  main,
  parseProjectCap,
  validateAllocation,
};
