const fs = require('node:fs');
const path = require('node:path');
const {
  evaluateSqlFiles,
  loadBaseline,
} = require('./sql-grant-guard-baseline');
const { listSqlFiles } = require('./sql-grant-guard');

// Unit-test snapshot: production checkRepository resolves the true PR base instead.
function checkSnapshot(root) {
  return evaluateSqlFiles({
    files: listSqlFiles(root),
    readFile: (file) => fs.readFileSync(path.join(root, file), 'utf8'),
    baseline: loadBaseline(root, 'HEAD'),
    verifiedFindings: require('./sql-grant-guard-verified-findings'),
  });
}
module.exports = { checkSnapshot };
