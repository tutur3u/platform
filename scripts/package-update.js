#!/usr/bin/env node

const { execSync } = require('node:child_process');
const os = require('node:os');

function main() {
  if (os.platform() !== 'win32') {
    execSync('./scripts/package-update.sh', { stdio: 'inherit' });
  } else {
    execSync('cmd /c scripts\\package-update.bat', { stdio: 'inherit' });
  }
}

if (require.main === module) {
  main();
}
