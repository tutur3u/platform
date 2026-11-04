#!/usr/bin/env node
// Print the salted hash of a term for the docs public-safety guard, so a new
// sensitive term can be added to scripts/docs-audit.js without spelling it out.
//   node scripts/ci/docs-safety-hash.js "<term>"
const { hashTerm } = require('../docs-audit');

const term = process.argv.slice(2).join(' ');
if (!term) {
  console.error('Usage: node scripts/ci/docs-safety-hash.js "<term>"');
  process.exit(1);
}
console.log(hashTerm(term));
