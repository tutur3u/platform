#!/usr/bin/env node
// CI Admitted: one always-on PR check that is red unless heavy hosted CI was
// admitted for this event. Skipped heavy checks are not evidence; this check
// makes their absence visible instead of reading as passing.
const fs = require('node:fs');
const { READY_LABEL } = require('./pr-label-gate');

function admissionDecision({ payloadLabels, currentLabels }) {
  const ready = currentLabels.includes(READY_LABEL);
  const atEvent = payloadLabels.includes(READY_LABEL);
  if (!ready) {
    return {
      admitted: false,
      reason: 'missing',
      message: `Heavy hosted CI is not admitted: the PR has no ${READY_LABEL} label, so heavy checks are skipped and are not evidence. Add ${READY_LABEL} when the PR is ready to merge, or rely on an exact-head local pass.`,
    };
  }
  if (!atEvent) {
    // The label arrived after this event was created (push/label race), so
    // this event's heavy runs skipped and may be the newest checks shown.
    return {
      admitted: false,
      reason: 'race',
      message: `${READY_LABEL} was added after this event started, so its heavy checks were skipped. Remove and re-add ${READY_LABEL} to admit the current head.`,
    };
  }
  return {
    admitted: true,
    reason: 'admitted',
    message: `Heavy hosted CI is admitted by ${READY_LABEL}.`,
  };
}

function parseLabels(source, name) {
  const value = JSON.parse(source || '[]');
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${name} must be a JSON array of label names`);
  }
  return value;
}

function main(env = process.env) {
  const decision = admissionDecision({
    payloadLabels: parseLabels(env.PAYLOAD_LABELS, 'PAYLOAD_LABELS'),
    currentLabels: parseLabels(
      fs.readFileSync(env.CURRENT_LABELS_FILE, 'utf8'),
      'CURRENT_LABELS_FILE'
    ),
  });
  if (env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(env.GITHUB_STEP_SUMMARY, `${decision.message}\n`);
  }
  if (decision.admitted) {
    console.log(decision.message);
    return 0;
  }
  console.log(`::error title=CI not admitted::${decision.message}`);
  return 1;
}

if (require.main === module) process.exitCode = main();

module.exports = { admissionDecision, main, parseLabels };
