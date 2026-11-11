#!/usr/bin/env node
// Prints the hash to add to src/content/title-denylist.ts. Never commit the term.
import { termHash } from '../src/live/feed.ts';

for (const term of process.argv.slice(2)) console.log(termHash(term));
