#!/usr/bin/env bun
// Lightweight entry for shims: no authenticated SDK or update-check imports.
import { runResourcesCommand } from './resources';

runResourcesCommand(process.argv.slice(2)).catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
});
