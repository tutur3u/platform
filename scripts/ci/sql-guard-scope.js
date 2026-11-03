const fs = require('node:fs');
const path = require('node:path');

// Exact directories: new locations require deliberate review, even below these.
const SQL_DIRECTORIES = [
  "apps/database/rollbacks",
  "apps/database/scripts",
  "apps/database/scripts/fixtures",
  "apps/database/scripts/fixtures/employee-address-migration",
  "apps/database/supabase",
  "apps/database/supabase/benchmarks",
  "apps/database/supabase/fixtures",
  "apps/database/supabase/migrations",
  "apps/database/supabase/tests",
  "apps/database/tests/programming-disposable",
  "apps/database/verification",
  "apps/database/verification/declarative-parity",
  "apps/hive/db",
  "apps/hive/db/migrations",
  "apps/lettin/migrations",
  "apps/supermemory/db",
  "apps/web/docker",
  "scripts/ci/fixtures"
];

function listSqlFiles(root = path.resolve(__dirname, '../..')) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const file = directory ? `${directory}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile() && entry.name.endsWith('.sql')) files.push(file);
    }
  }
  walk('');
  return files.sort();
}

function unlistedSqlFiles(root) {
  return listSqlFiles(root).filter((file) => !SQL_DIRECTORIES.includes(path.posix.dirname(file)));
}

module.exports = { SQL_DIRECTORIES, listSqlFiles, unlistedSqlFiles };
