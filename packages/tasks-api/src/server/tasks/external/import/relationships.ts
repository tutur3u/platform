import type { NormalizedIssue } from '../schemas';
import type { Context } from './run-support';
import type { IssueResult } from './run-support';

export async function linkRelationships(
  ctx: Context,
  issues: NormalizedIssue[],
  results: IssueResult[]
) {
  const urls = new Set<string>();
  for (const issue of issues) {
    urls.add(issue.url);
    if (issue.parent_url) urls.add(issue.parent_url);
    for (const sub of issue.sub_issue_urls) urls.add(sub);
  }
  const ids = await ctx.store.taskIdsByRefUrl(ctx.wsId, [...urls]);
  const pairs = new Map<string, [string, string, IssueResult[]]>();
  issues.forEach((issue, index) => {
    const result = results[index];
    if (!result || result.error) return;
    const edges: Array<[string, string]> = [
      ...(issue.parent_url
        ? [[issue.parent_url, issue.url] as [string, string]]
        : []),
      ...issue.sub_issue_urls.map(
        (sub) => [issue.url, sub] as [string, string]
      ),
    ];
    for (const [parentUrl, childUrl] of edges) {
      const parent = ids.get(parentUrl);
      const child = ids.get(childUrl);
      if (parent && child && parent !== child) {
        const key = `${parent}>${child}`;
        pairs.set(key, [
          parent,
          child,
          [...(pairs.get(key)?.[2] ?? []), result],
        ]);
      } else
        result.warnings.push(
          `relationship_pending: ${parent ? childUrl : parentUrl}`
        );
    }
  });
  // A refused pair (for example a child that already has another parent)
  // becomes a warning on the issues involved; it never fails the batch.
  for (const [parent, child, involved] of pairs.values()) {
    try {
      await ctx.store.linkParentChild(parent, child, ctx.actorId);
    } catch {
      for (const result of involved) {
        result.warnings.push('relationship_failed');
      }
    }
  }
}
