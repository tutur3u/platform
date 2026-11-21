#!/usr/bin/env node
// Prints the Windows Store package version (X.Y.Z.0) for a ledger version.
import { windowsPackageVersion } from './ledger.mjs';

try {
  process.stdout.write(windowsPackageVersion(process.argv[2]));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
