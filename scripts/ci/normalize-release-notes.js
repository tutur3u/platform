const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const referencePattern =
  /\(\[[^\]]+\]\(https:\/\/github\.com\/tutur3u\/platform\/(?:commit|issues|pull)\/[^)]+\)\)/g;

/** Only normalize unpublished additions; published release text is immutable. */
function normalizeReleaseNotes(
  content,
  previous,
  isIntegrationCommit = () => false
) {
  const previousHeading = previous.match(/^#{2,3} \[.*$/m)?.[0];
  const boundary = previousHeading
    ? content.indexOf(previousHeading)
    : content.length;
  if (boundary < 0) throw new Error('Published changelog boundary is missing');
  const lines = content.slice(0, boundary).split('\n');
  const output = [];
  let entries = new Map();
  for (const line of lines) {
    if (/^#{2,3} /.test(line)) entries = new Map();
    const references = [...line.matchAll(referencePattern)].map(
      (match) => match[0]
    );
    const firstReference = line.search(referencePattern);
    if (!/^[*-] /.test(line) || firstReference < 0 || references.length === 0) {
      output.push(line);
      continue;
    }
    const description = line.slice(0, firstReference).trimEnd();
    // Preserve nonstandard trailing prose instead of interpreting it as metadata.
    if (line.slice(firstReference).replace(referencePattern, '').trim()) {
      output.push(line);
      continue;
    }
    const hashes = references.flatMap((reference) => {
      const hash = reference.match(/\/commit\/([a-f0-9]{40})\)/)?.[1];
      return hash ? [hash] : [];
    });
    if (hashes.length && hashes.every(isIntegrationCommit)) continue;
    const existing = entries.get(description);
    if (existing) {
      existing.references = [
        ...new Set([...existing.references, ...references]),
      ];
      output[existing.index] =
        `${description} ${existing.references.join(' ')}`;
    } else {
      entries.set(description, { index: output.length, references });
      output.push(line);
    }
  }
  return output.join('\n') + content.slice(boundary);
}

function main(base = 'origin/production') {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
  const paths = git('diff', '--name-only', '-z', `${base}...HEAD`)
    .split('\0')
    .filter((file) => /(^|\/)CHANGELOG\.md$/.test(file));
  const cache = new Map();
  const isIntegrationCommit = (hash) => {
    if (!cache.has(hash)) {
      const [parents, subject] = git('show', '-s', '--format=%P%n%s', hash)
        .trim()
        .split('\n');
      cache.set(
        hash,
        parents.split(' ').length > 1 &&
          /^(?:fix|feat)(?:\([^)]*\))?: (?:address review and integrate current main|merge (?:current )?main)$/i.test(
            subject
          )
      );
    }
    return cache.get(hash);
  };
  let changed = 0;
  for (const file of paths) {
    if (!fs.existsSync(file)) continue;
    if (!fs.lstatSync(file).isFile())
      throw new Error(`Generated changelog is not a regular file: ${file}`);
    let previous = '';
    try {
      previous = git('show', `${base}:${file}`);
    } catch {
      if (git('ls-tree', '--name-only', base, '--', file).trim())
        throw new Error(`Cannot read published history: ${file}`);
    }
    const content = fs.readFileSync(file, 'utf8');
    const normalized = normalizeReleaseNotes(
      content,
      previous,
      isIntegrationCommit
    );
    if (normalized !== content) {
      fs.writeFileSync(file, normalized);
      changed++;
    }
  }
  console.log(
    `Normalized ${changed} generated changelog files; published history preserved.`
  );
}

module.exports = { normalizeReleaseNotes };
if (require.main === module) main(process.argv[2]);
