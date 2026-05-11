const fs = require('node:fs');
const path = require('node:path');

const PROD_COMPOSE_MAIN = 'docker-compose.web.prod.yml';

/**
 * @param {string} rootDir
 * @param {typeof fs} [fsImpl]
 * @returns {string[]}
 */
function listProdComposeWatchedRelativePaths(rootDir, fsImpl = fs) {
  const mainPath = path.join(rootDir, PROD_COMPOSE_MAIN);
  const mainContent = fsImpl.readFileSync(mainPath, 'utf8');
  const paths = [PROD_COMPOSE_MAIN];
  let inInclude = false;

  for (const line of mainContent.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (/^include:\s*(?:#.*)?$/u.test(trimmed)) {
      inInclude = true;
      continue;
    }
    if (inInclude) {
      const match = line.match(/^\s*-\s*path:\s*(.+?)\s*$/u);
      if (match) {
        let rel = match[1].trim().replace(/^["']|["']$/gu, '');
        rel = rel.replace(/\\/gu, '/');
        paths.push(rel);
        continue;
      }
      if (trimmed && !/^\s/u.test(line)) {
        inInclude = false;
      }
    }
  }

  return paths;
}

/**
 * Concatenate the production compose entry file plus every `include.path`
 * fragment so string-based parity checks can run over the full surface.
 *
 * @param {string} rootDir
 * @param {typeof fs} [fsImpl]
 * @returns {string}
 */
function readDockerProdComposeMergedText(rootDir, fsImpl = fs) {
  const mainPath = path.join(rootDir, PROD_COMPOSE_MAIN);
  const mainContent = fsImpl.readFileSync(mainPath, 'utf8');
  const chunks = [mainContent];

  for (const rel of listProdComposeWatchedRelativePaths(rootDir, fsImpl)) {
    if (rel === PROD_COMPOSE_MAIN) {
      continue;
    }
    const fragPath = path.join(rootDir, rel);
    if (fsImpl.existsSync(fragPath)) {
      chunks.push(fsImpl.readFileSync(fragPath, 'utf8'));
    }
  }

  return chunks.join('\n');
}

module.exports = {
  PROD_COMPOSE_MAIN,
  listProdComposeWatchedRelativePaths,
  readDockerProdComposeMergedText,
};
