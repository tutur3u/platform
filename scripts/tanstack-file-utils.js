const fs = require('node:fs');
const path = require('node:path');

function listFilesRecursive(directory, fsImpl = fs) {
  if (!fsImpl.existsSync(directory)) {
    return [];
  }

  const entries = fsImpl.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(entryPath, fsImpl));
      continue;
    }

    if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

module.exports = {
  listFilesRecursive,
};
