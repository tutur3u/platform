const { patterns } = require('./release-note-policy.json');
const matchers = patterns.map((pattern) => new RegExp(pattern, 'iu'));

/** Omit known Git bookkeeping, never arbitrary product text containing merge. */
function isReleaseBookkeeping(subject) {
  const description = subject
    .replace(/^\w+(?:\([^)]*\))?!?:\s*/u, '')
    .replace(/^\*\*[^*]+:\*\*\s*/u, '')
    .replace(/\s*\(#\d+\)$/u, '')
    .replace(
      /\s*\(\[[^\]]+\]\(https:\/\/github\.com\/tutur3u\/platform\/(?:commit|issues|pull)\/[^)]+\)\)/gu,
      ''
    )
    .trim();
  return matchers.some((pattern) => pattern.test(description));
}

function filterReleaseBookkeeping(markdown) {
  return markdown
    .split('\n')
    .filter((line) => {
      const bullet = /^\s*[-*]\s+(.+)$/u.exec(line);
      return !bullet || !isReleaseBookkeeping(bullet[1]);
    })
    .join('\n');
}

module.exports = { isReleaseBookkeeping, filterReleaseBookkeeping };
