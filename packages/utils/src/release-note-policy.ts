import policy from './release-note-policy.json';

const patterns = policy.patterns.map((pattern) => new RegExp(pattern, 'iu'));

/** Filter known Git merge/sync metadata while retaining product merge features. */
export function isReleaseBookkeeping(subject: string): boolean {
  const description = subject
    .replace(/^\w+(?:\([^)]*\))?!?:\s*/u, '')
    .replace(/^\*\*[^*]+:\*\*\s*/u, '')
    .replace(/\s*\(#\d+\)$/u, '')
    .replace(
      /\s*\(\[[^\]]+\]\(https:\/\/github\.com\/tutur3u\/platform\/(?:commit|issues|pull)\/[^)]+\)\)/gu,
      ''
    )
    .trim();
  return patterns.some((pattern) => pattern.test(description));
}
