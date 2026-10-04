const { isReleaseBookkeeping } = require('./release-note-policy');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const referencePattern =
  /\(\[[^\]]+\]\(https:\/\/github\.com\/tutur3u\/platform\/(?:commit|issues|pull)\/[^)]+\)\)/g;

// #5734 contains the original offline checkout commit and its merge commit.
// Their titles differ because the merge also names cached images. Match this
// proven pair by BOTH exact source identities; title similarity alone is unsafe.
const mobileOfflinePair = [
  {
    hash: 'a45d63498cc1e686d1d070f5861cf938c4e9a9ef',
    description:
      '* **mobile:** support offline data and safe inventory checkout',
  },
  {
    hash: '2f0f39763daea56f1029fcc3e99e0be53c60e106',
    description:
      '* **mobile:** support offline data, cached images, and safe inventory checkout',
  },
];

function equivalentMobileEntry(entries, description, hashes) {
  const index = mobileOfflinePair.findIndex(
    (entry) => entry.description === description && hashes.includes(entry.hash)
  );
  if (index < 0) return undefined;
  const counterpart = mobileOfflinePair[1 - index];
  const existing = entries.get(counterpart.description);
  if (!existing?.hashes.includes(counterpart.hash)) return undefined;
  existing.description = mobileOfflinePair[1].description;
  return existing;
}

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
    if (
      /^[*-] /.test(line) &&
      isReleaseBookkeeping(line.slice(2).replace(referencePattern, '').trim())
    )
      continue;
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
    const existing =
      entries.get(description) ||
      equivalentMobileEntry(entries, description, hashes);
    if (existing) {
      existing.references = [
        ...new Set([...existing.references, ...references]),
      ];
      output[existing.index] =
        `${existing.description} ${existing.references.join(' ')}`;
      existing.hashes = [...new Set([...existing.hashes, ...hashes])];
      entries.set(description, existing);
    } else {
      entries.set(description, {
        index: output.length,
        references,
        description,
        hashes,
      });
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
